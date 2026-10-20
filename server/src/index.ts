import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { config, ensureDataDirs } from "./config.js";
import {
  deleteProject,
  listProjects,
  loadProject,
  loadSettings,
  saveProject,
  saveSettings,
} from "./storage.js";
import { claudeVersion, fallbackPlan, generatePlan } from "./claude.js";
import {
  AgentManager,
  autoLayout,
  buildEdges,
  createAgent,
  createCeoAgent,
} from "./agents.js";
import { WsHub, type ClientMessage } from "./ws.js";
import type { Agent, Project } from "./types.js";

ensureDataDirs();

const settings = loadSettings();
const hub = new WsHub();

const manager = new AgentManager(
  hub,
  (project) => saveProject(project),
  () => settings,
);

hub.onClientMessage = (msg: ClientMessage) => {
  switch (msg.type) {
    case "terminal.input":
      manager.handleInput(msg.projectId, msg.agentId, Buffer.from(msg.data, "base64").toString("utf8"));
      break;
    case "terminal.resize":
      manager.handleResize(msg.projectId, msg.agentId, msg.cols, msg.rows);
      break;
    case "terminal.backlog.request": {
      const project = loadProject(msg.projectId);
      if (project) manager.sendBacklog(project, msg.agentId);
      break;
    }
  }
};

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  platform: process.platform,
  dataDir: config.dataDir,
  claudeVersion: claudeVersion(),
  version: "0.1.0",
}));

app.get("/api/settings", async () => settings);
app.put("/api/settings", async (req, reply) => {
  const body = req.body as Partial<typeof settings>;
  if (typeof body.skipPermissions === "boolean") settings.skipPermissions = body.skipPermissions;
  saveSettings(settings);
  reply.send(settings);
});

app.get("/api/projects", async () => ({
  projects: listProjects().map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    agentCount: p.agents.length,
    createdAt: p.createdAt,
  })),
}));

app.post("/api/projects", async (req, reply) => {
  const { request } = (req.body ?? {}) as { request?: string };
  if (!request || typeof request !== "string" || request.trim().length < 3) {
    return reply.code(400).send({ error: "request must be a non-empty description" });
  }

  const id = randomUUID();
  const workspace = path.join(config.workspacesDir, id);
  fs.mkdirSync(workspace, { recursive: true });

  const project: Project = {
    id,
    name: request.trim().slice(0, 60),
    request: request.trim(),
    description: "",
    technologies: [],
    requirements: "",
    status: "planning",
    createdAt: Date.now(),
    agents: [createCeoAgent(id, workspace)],
    edges: [],
    positions: { ceo: { x: 0, y: 0 } },
  };
  saveProject(project);
  hub.toProject(id, { type: "project.updated", projectId: id, project });
  reply.code(201).send({ project });

  // CEO planning runs asynchronously; the frontend watches events.
  void runPlanning(project);
});

async function runPlanning(initial: Project): Promise<void> {
  const ceo = initial.agents[0];
  const log = (line: string) => {
    hub.toProject(initial.id, { type: "ceo.log", projectId: initial.id, line });
    manager.appendLog(initial.id, "ceo", `${line}\r\n`);
  };

  const setStatus = (status: Agent["status"]) => {
    const fresh = loadProject(initial.id);
    const agent = fresh?.agents.find((a) => a.id === "ceo");
    if (fresh && agent) manager.setStatus(fresh, agent, status as Agent["status"]);
  };
  setStatus("running");

  const plan = await generatePlan(initial.request, log);

  const finalPlan = plan ?? fallbackPlan(initial.request);
  if (!plan) log("[opencrew] Using fallback team plan (heuristic).");

  const project = loadProject(initial.id);
  if (!project) return;

  // Sanitize plan: dedupe ids, drop unknown dependencies, enforce caps.
  const seen = new Set<string>();
  const agents = [];
  for (const pa of finalPlan.agents.slice(0, config.maxSpecializedAgents)) {
    let agentId = pa.id;
    let n = 2;
    while (seen.has(agentId)) agentId = `${pa.id}-${n++}`;
    seen.add(agentId);
    agents.push({ ...pa, id: agentId, dependencies: [] });
  }
  for (const a of agents) {
    a.dependencies = a.dependencies.filter((d) => seen.has(d) && d !== a.id);
  }

  project.name = finalPlan.projectName || project.name;
  project.description = finalPlan.description;
  project.technologies = finalPlan.technologies;
  project.requirements = finalPlan.requirements;
  project.status = "active";

  const specialized = agents.map((pa) => createAgent(project.id, pa, project.agents[0].workspace));
  project.agents = [project.agents[0], ...specialized];
  project.edges = buildEdges(project.agents);
  project.positions = autoLayout(project.agents, project.edges);
  saveProject(project);

  // Write the shared requirements document if the CEO did not create one.
  const projectMd = path.join(project.agents[0].workspace, "PROJECT.md");
  if (!fs.existsSync(projectMd)) {
    const content = [
      `# ${project.name}`,
      "",
      "## Original request",
      "",
      project.request,
      "",
      "## Description",
      "",
      project.description || "(none)",
      "",
      "## Technologies",
      "",
      project.technologies.length ? project.technologies.map((t) => `- ${t}`).join("\n") : "(decided by agents)",
      "",
      "## Requirements",
      "",
      project.requirements || project.description || project.request,
      "",
    ].join("\n");
    fs.writeFileSync(projectMd, content);
  }

  hub.toProject(project.id, {
    type: "team.created",
    projectId: project.id,
    agents: project.agents,
    edges: project.edges,
    positions: project.positions,
  });
  hub.toProject(project.id, { type: "project.updated", projectId: project.id, project });

  log("[opencrew] Team plan created. Starting agents…");
  setStatus("idle");
  const fresh = loadProject(project.id);
  if (fresh) {
    const ceoAgent = fresh.agents.find((a) => a.id === "ceo");
    if (ceoAgent) void manager.start(fresh, ceoAgent, { seed: false });
    manager.startRoots(fresh);
  }
}

app.get("/api/projects/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const project = loadProject(id);
  if (!project) return reply.code(404).send({ error: "project not found" });
  reply.send({ project });
});

app.delete("/api/projects/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  manager.stopAllForProject(id);
  deleteProject(id);
  reply.send({ ok: true });
});

app.patch("/api/projects/:id/layout", async (req, reply) => {
  const { id } = req.params as { id: string };
  const { positions } = (req.body ?? {}) as { positions?: Record<string, { x: number; y: number }> };
  const project = loadProject(id);
  if (!project) return reply.code(404).send({ error: "project not found" });
  if (positions && typeof positions === "object") {
    for (const [agentId, pos] of Object.entries(positions)) {
      if (typeof pos?.x === "number" && typeof pos?.y === "number") {
        project.positions[agentId] = { x: pos.x, y: pos.y };
      }
    }
    saveProject(project);
  }
  reply.send({ ok: true });
});

app.post("/api/projects/:id/agents/:agentId/start", async (req, reply) => {
  const { id, agentId } = req.params as { id: string; agentId: string };
  const project = loadProject(id);
  const agent = project?.agents.find((a) => a.id === agentId);
  if (!project || !agent) return reply.code(404).send({ error: "agent not found" });
  void manager.start(project, agent, { seed: false });
  reply.send({ ok: true });
});

app.post("/api/projects/:id/agents/:agentId/stop", async (req, reply) => {
  const { id, agentId } = req.params as { id: string; agentId: string };
  const project = loadProject(id);
  const agent = project?.agents.find((a) => a.id === agentId);
  if (!project || !agent) return reply.code(404).send({ error: "agent not found" });
  manager.stop(project, agent);
  reply.send({ ok: true });
});

app.post("/api/projects/:id/agents/:agentId/restart", async (req, reply) => {
  const { id, agentId } = req.params as { id: string; agentId: string };
  const project = loadProject(id);
  const agent = project?.agents.find((a) => a.id === agentId);
  if (!project || !agent) return reply.code(404).send({ error: "agent not found" });
  void manager.restart(project, agent);
  reply.send({ ok: true });
});

// Serve the built frontend when available (production mode).
const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/ws")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
}

const server = app.server;
hub.attach(server);

await app.listen({ port: config.port, host: config.host });
console.log(`[opencrew] server listening on http://localhost:${config.port}`);
console.log(`[opencrew] data dir: ${config.dataDir}`);
console.log(`[opencrew] claude: ${claudeVersion() ?? "NOT FOUND — install with npm i -g @anthropic-ai/claude-code"}`);
