import { useSyncExternalStore } from "react";
import { api, terminalBus } from "./api";
import type {
  Agent,
  Health,
  Project,
  ProjectSummary,
  ServerMessage,
  Settings,
} from "./types";

export interface AppState {
  connection: "connecting" | "open" | "closed";
  projects: ProjectSummary[];
  activeProject: Project | null;
  selectedAgentId: string | null;
  panelOpen: boolean;
  panelFullscreen: boolean;
  terminalKinds: Record<string, string>;
  settings: Settings | null;
  health: Health | null;
  showSettings: boolean;
}

let state: AppState = {
  connection: "connecting",
  projects: [],
  activeProject: null,
  selectedAgentId: null,
  panelOpen: false,
  panelFullscreen: false,
  terminalKinds: {},
  settings: null,
  health: null,
  showSettings: false,
};

const listeners = new Set<() => void>();

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function refreshProjects(): Promise<void> {
  const { projects } = await api.listProjects();
  setState({ projects });
}

export async function openProject(id: string): Promise<void> {
  const { project } = await api.getProject(id);
  setState({ activeProject: project, selectedAgentId: null, panelOpen: false });
  api.send({ type: "subscribe.project", projectId: id });
  for (const agent of project.agents) {
    api.send({ type: "terminal.backlog.request", projectId: id, agentId: agent.id });
  }
}

export async function createProject(request: string): Promise<void> {
  const { project } = await api.createProject(request);
  setState({ activeProject: project, selectedAgentId: null, panelOpen: false });
  api.send({ type: "subscribe.project", projectId: project.id });
  await refreshProjects();
}

export function selectAgent(agentId: string | null): void {
  const open = agentId !== null;
  setState({ selectedAgentId: agentId, panelOpen: open });
  const project = state.activeProject;
  if (open && project) {
    api.send({ type: "terminal.backlog.request", projectId: project.id, agentId });
  }
}

export function closePanel(): void {
  setState({ panelOpen: false, panelFullscreen: false });
}

export async function refreshMeta(): Promise<void> {
  try {
    const [health, settings] = await Promise.all([api.getHealth(), api.getSettings()]);
    setState({ health, settings });
  } catch {
    /* server may still be starting */
  }
}

// ---------------------------------------------------------------------------
// WebSocket wiring
// ---------------------------------------------------------------------------

let wired = false;

export function wireSocket(): void {
  if (wired) return;
  wired = true;

  api.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case "pong":
        setState({ connection: "open" });
        break;
      case "project.updated": {
        if (state.activeProject?.id === msg.projectId) {
          setState({ activeProject: msg.project });
        }
        void refreshProjects();
        break;
      }
      case "team.created": {
        if (state.activeProject?.id === msg.projectId) {
          const project: Project = {
            ...state.activeProject,
            agents: msg.agents,
            edges: msg.edges,
            positions: msg.positions,
          };
          setState({ activeProject: project });
        }
        break;
      }
      case "agent.updated": {
        const project = state.activeProject;
        if (project && project.id === msg.projectId) {
          const agents = project.agents.map((a) => (a.id === msg.agent.id ? msg.agent : a));
          setState({ activeProject: { ...project, agents } });
        }
        break;
      }
      case "agent.output": {
        if (state.activeProject?.id === msg.projectId) {
          terminalBus.push(msg.projectId, msg.agentId, atob(msg.data));
        }
        break;
      }
      case "agent.backlog": {
        if (state.activeProject?.id === msg.projectId) {
          terminalBus.setBacklog(msg.projectId, msg.agentId, atob(msg.data));
        }
        break;
      }
      case "agent.exit": {
        const project = state.activeProject;
        if (project && project.id === msg.projectId) {
          const agents = project.agents.map((a) =>
            a.id === msg.agentId ? { ...a, exitCode: msg.exitCode } : a,
          );
          setState({ activeProject: { ...project, agents } });
        }
        break;
      }
      case "agent.session": {
        if (state.activeProject?.id === msg.projectId) {
          setState({
            terminalKinds: { ...state.terminalKinds, [msg.agentId]: msg.kind },
          });
        }
        break;
      }
      case "ceo.log": {
        if (state.activeProject?.id === msg.projectId) {
          terminalBus.push(msg.projectId, "ceo", `${msg.line}\r\n`);
        }
        break;
      }
      case "error":
        console.error("[opencrew]", msg.message);
        break;
    }
  });

  api.connect();
  void refreshMeta();
  void refreshProjects();
}

export function agentsByCreation(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => a.createdAt - b.createdAt);
}
