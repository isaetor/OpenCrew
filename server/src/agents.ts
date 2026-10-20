import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { renderInstructions } from "./templates.js";
import { claudeLaunchArgs, spawnClaudeSession, type TerminalSession } from "./pty.js";
import type { Agent, AgentStatus, EdgeDef, NodePosition, Project } from "./types.js";
import type { WsHub } from "./ws.js";

const roleTitle: Record<string, string> = {
  ceo: "Chief Executive Officer",
  frontend: "Frontend Developer",
  backend: "Backend Developer",
  database: "Database Engineer",
  tester: "QA Engineer",
  git: "Git & Release Engineer",
  devops: "DevOps Engineer",
  general: "Developer",
};

interface Runner {
  projectId: string;
  agentId: string;
  session: TerminalSession | null;
  backlog: string;
  cols: number;
  rows: number;
  seedPrompt: string | null;
  started: boolean;
}

export class AgentManager {
  private runners = new Map<string, Runner>();
  private stopped = new Set<string>();

  constructor(
    private hub: WsHub,
    private persist: (project: Project) => void,
    private getSettings: () => { skipPermissions: boolean },
  ) {}

  private key(projectId: string, agentId: string): string {
    return `${projectId}:${agentId}`;
  }

  backlog(agentId: string, projectId: string): string {
    return this.runners.get(this.key(projectId, agentId))?.backlog ?? "";
  }

  sessionKind(agentId: string, projectId: string): string | null {
    const r = this.runners.get(this.key(projectId, agentId));
    return r?.session?.kind ?? null;
  }

  isRunning(projectId: string, agentId: string): boolean {
    const r = this.runners.get(this.key(projectId, agentId));
    return !!r?.session;
  }

  /** Broadcast a backlog snapshot so a freshly opened panel can catch up. */
  sendBacklog(project: Project, agentId: string): void {
    this.hub.toProject(project.id, {
      type: "agent.backlog",
      projectId: project.id,
      agentId,
      data: Buffer.from(this.backlog(agentId, project.id), "utf8").toString("base64"),
    });
  }

  appendBacklog(runner: Runner, chunk: string): void {
    runner.backlog += chunk;
    const max = config.terminalBacklogBytes;
    if (runner.backlog.length > max) {
      runner.backlog = runner.backlog.slice(runner.backlog.length - max);
    }
  }

  setStatus(project: Project, agent: Agent, status: AgentStatus, exitCode: number | null = null): void {
    agent.status = status;
    if (exitCode !== null) agent.exitCode = exitCode;
    if (status === "running") agent.startedAt = Date.now();
    this.hub.toProject(project.id, { type: "agent.updated", projectId: project.id, agent });
    this.persist(project);
  }

  /**
   * Start (or resume) an agent's interactive Claude Code session.
   * The seed prompt is used only on the first run so the agent begins its
   * assigned task immediately; later starts open a plain interactive session.
   */
  async start(project: Project, agent: Agent, opts: { seed?: boolean } = {}): Promise<void> {
    const key = this.key(project.id, agent.id);
    if (this.runners.get(key)?.session) return;
    this.stopped.delete(key);

    const useSeed = opts.seed !== false && !this.runners.get(key)?.started;
    const cols = this.runners.get(key)?.cols ?? 120;
    const rows = this.runners.get(key)?.rows ?? 30;

    let runner = this.runners.get(key);
    if (!runner) {
      runner = {
        projectId: project.id,
        agentId: agent.id,
        session: null,
        backlog: "",
        cols,
        rows,
        seedPrompt: agent.task,
        started: false,
      };
      this.runners.set(key, runner);
    }

    this.setStatus(project, agent, "running");

    try {
      const args = claudeLaunchArgs(
        useSeed ? runner.seedPrompt : null,
        this.getSettings().skipPermissions,
      );
      const session = await spawnClaudeSession(agent.workspace, args, cols, rows, {
        onData: (data) => {
          this.appendBacklog(runner!, data);
          this.hub.toProject(project.id, {
            type: "agent.output",
            projectId: project.id,
            agentId: agent.id,
            data: Buffer.from(data, "utf8").toString("base64"),
          });
        },
        onExit: (code) => {
          runner!.session = null;
          const fresh = this.loadFresh(project.id);
          if (fresh) {
            const a = fresh.agents.find((x) => x.id === agent.id);
            if (a && !this.stopped.has(key)) {
              this.setStatus(fresh, a, code === 0 ? "completed" : "failed", code);
              this.kickDependents(fresh);
            }
          }
          this.hub.toProject(project.id, {
            type: "agent.exit",
            projectId: project.id,
            agentId: agent.id,
            exitCode: code,
          });
        },
      });
      runner.session = session;
      runner.started = true;
      this.hub.toProject(project.id, {
        type: "agent.session",
        projectId: project.id,
        agentId: agent.id,
        kind: session.kind,
        pid: session.pid ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.appendBacklog(runner, `\r\n[opencrew] ${message}\r\n`);
      this.hub.toProject(project.id, {
        type: "agent.output",
        projectId: project.id,
        agentId: agent.id,
        data: Buffer.from(`\r\n[opencrew] ${message}\r\n`, "utf8").toString("base64"),
      });
      this.setStatus(project, agent, "failed");
    }
  }

  stop(project: Project, agent: Agent): void {
    const key = this.key(project.id, agent.id);
    const runner = this.runners.get(key);
    this.stopped.add(key);
    if (runner?.session) {
      runner.session.kill();
      runner.session = null;
    }
    this.setStatus(project, agent, "stopped");
  }

  restart(project: Project, agent: Agent): Promise<void> {
    this.stop(project, agent);
    return new Promise((resolve) => {
      setTimeout(() => this.start(project, agent, { seed: false }).then(resolve), 500);
    });
  }

  handleInput(projectId: string, agentId: string, data: string): void {
    const runner = this.runners.get(this.key(projectId, agentId));
    if (runner?.session) runner.session.write(data);
  }

  handleResize(projectId: string, agentId: string, cols: number, rows: number): void {
    const runner = this.runners.get(this.key(projectId, agentId));
    if (!runner) return;
    runner.cols = Math.max(20, Math.min(500, cols));
    runner.rows = Math.max(5, Math.min(300, rows));
    runner.session?.resize(runner.cols, runner.rows);
  }

  /** Append a plain log line to an agent's backlog (e.g. CEO planning events). */
  appendLog(projectId: string, agentId: string, line: string): void {
    const runner = this.runners.get(this.key(projectId, agentId));
    if (runner) this.appendBacklog(runner, line);
  }

  /** Start every agent whose dependencies are all completed. */
  kickDependents(project: Project): void {
    const ready = project.agents.filter(
      (a) =>
        a.status === "idle" &&
        a.dependencies.length > 0 &&
        a.dependencies.every((depId) => {
          const dep = project.agents.find((x) => x.id === depId);
          return dep && dep.status === "completed";
        }),
    );
    for (const agent of ready) {
      setTimeout(() => {
        const fresh = this.loadFresh(project.id);
        const a = fresh?.agents.find((x) => x.id === agent.id);
        if (fresh && a && a.status === "idle") void this.start(fresh, a, { seed: true });
      }, 800);
    }
  }

  /** Start all agents with no dependencies, staggered for canvas animation. */
  startRoots(project: Project): void {
    const roots = project.agents.filter((a) => a.dependencies.length === 0 && a.id !== "ceo");
    roots.forEach((agent, i) => {
      setTimeout(() => {
        const fresh = this.loadFresh(project.id);
        const a = fresh?.agents.find((x) => x.id === agent.id);
        if (fresh && a && a.status === "idle") void this.start(fresh, a, { seed: true });
      }, 800 + i * 900);
    });
  }

  stopAllForProject(projectId: string): void {
    for (const [key, runner] of this.runners) {
      if (runner.projectId === projectId && runner.session) {
        this.stopped.add(key);
        runner.session.kill();
        runner.session = null;
      }
    }
  }

  /** Reload the authoritative project state from disk before acting on it. */
  private loadFresh(projectId: string): Project | null {
    try {
      const file = path.join(config.projectsDir, `${projectId}.json`);
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { project: Project };
      return parsed.project;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Agent Factory
// ---------------------------------------------------------------------------

export function createAgent(
  projectId: string,
  planAgent: { id: string; name: string; role: string; task: string; dependencies: string[] },
  workspaceRoot: string,
): Agent {
  const workspace = path.join(workspaceRoot, planAgent.id);
  fs.mkdirSync(workspace, { recursive: true });
  const instructions = renderInstructions(planAgent.role, {
    name: planAgent.name,
    roleTitle: roleTitle[planAgent.role] ?? roleTitle.general,
    task: planAgent.task,
  });
  return {
    id: planAgent.id,
    projectId,
    name: planAgent.name,
    role: (planAgent.role as Agent["role"]) ?? "general",
    instructions,
    task: planAgent.task,
    workspace,
    status: "idle",
    exitCode: null,
    dependencies: planAgent.dependencies,
    createdAt: Date.now(),
    startedAt: null,
  };
}

export function createCeoAgent(projectId: string, workspaceRoot: string): Agent {
  const workspace = workspaceRoot;
  const instructions = renderInstructions("ceo", {
    name: "CEO Agent",
    roleTitle: roleTitle.ceo,
    task: "Analyze the project request, produce PROJECT.md, and define the team plan.",
  });
  return {
    id: "ceo",
    projectId,
    name: "CEO Agent",
    role: "ceo",
    instructions,
    task: "Analyze the project request and assemble the team.",
    workspace,
    status: "creating",
    exitCode: null,
    dependencies: [],
    createdAt: Date.now(),
    startedAt: null,
  };
}

/** Longest-path layering layout, centered rows like a org chart. */
export function autoLayout(agents: Agent[], edges: EdgeDef[]): Record<string, NodePosition> {
  const levels = new Map<string, number>();
  const byId = new Map(agents.map((a) => [a.id, a]));
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  }

  const levelOf = (id: string, seen = new Set<string>()): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = incoming.get(id) ?? [];
    const level = deps.length === 0 ? 0 : Math.max(...deps.map((d) => (byId.has(d) ? levelOf(d, seen) : 0))) + 1;
    levels.set(id, level);
    return level;
  };
  for (const a of agents) levelOf(a.id);

  const rows = new Map<number, string[]>();
  for (const a of agents) {
    const lvl = levels.get(a.id) ?? 0;
    rows.set(lvl, [...(rows.get(lvl) ?? []), a.id]);
  }

  const positions: Record<string, NodePosition> = {};
  for (const [lvl, ids] of rows) {
    const width = ids.length * 340;
    ids.forEach((id, i) => {
      positions[id] = { x: i * 340 - width / 2 + 170, y: lvl * 280 };
    });
  }
  return positions;
}

export function buildEdges(agents: Agent[]): EdgeDef[] {
  const ids = new Set(agents.map((a) => a.id));
  const edges: EdgeDef[] = [];
  for (const agent of agents) {
    const deps = agent.dependencies.filter((d) => ids.has(d) && d !== agent.id);
    if (deps.length === 0 && agent.id !== "ceo") {
      edges.push({ id: `ceo->${agent.id}`, source: "ceo", target: agent.id });
    } else {
      for (const dep of deps) {
        edges.push({ id: `${dep}->${agent.id}`, source: dep, target: agent.id });
      }
    }
  }
  return edges;
}
