export type AgentRole =
  | "ceo"
  | "frontend"
  | "backend"
  | "database"
  | "tester"
  | "git"
  | "devops"
  | "general";

export type AgentStatus =
  | "creating"
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export interface Agent {
  id: string;
  projectId: string;
  name: string;
  role: AgentRole;
  instructions: string;
  task: string;
  workspace: string;
  status: AgentStatus;
  exitCode: number | null;
  dependencies: string[];
  createdAt: number;
  startedAt: number | null;
}

export interface EdgeDef {
  id: string;
  source: string;
  target: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface Project {
  id: string;
  name: string;
  request: string;
  description: string;
  technologies: string[];
  requirements: string;
  status: "planning" | "active" | "failed";
  createdAt: number;
  agents: Agent[];
  edges: EdgeDef[];
  positions: Record<string, NodePosition>;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: Project["status"];
  agentCount: number;
  createdAt: number;
}

export interface Health {
  ok: boolean;
  platform: string;
  dataDir: string;
  claudeVersion: string | null;
  version: string;
}

export interface Settings {
  skipPermissions: boolean;
}

export type ServerMessage =
  | { type: "project.updated"; projectId: string; project: Project }
  | { type: "team.created"; projectId: string; agents: Agent[]; edges: EdgeDef[]; positions: Record<string, NodePosition> }
  | { type: "agent.updated"; projectId: string; agent: Agent }
  | { type: "agent.output"; projectId: string; agentId: string; data: string }
  | { type: "agent.backlog"; projectId: string; agentId: string; data: string }
  | { type: "agent.exit"; projectId: string; agentId: string; exitCode: number }
  | { type: "agent.session"; projectId: string; agentId: string; kind: string; pid: number | null }
  | { type: "ceo.log"; projectId: string; line: string }
  | { type: "error"; message: string }
  | { type: "pong" };

export type ClientMessage =
  | { type: "subscribe.project"; projectId: string }
  | { type: "terminal.input"; projectId: string; agentId: string; data: string }
  | { type: "terminal.resize"; projectId: string; agentId: string; cols: number; rows: number }
  | { type: "terminal.backlog.request"; projectId: string; agentId: string }
  | { type: "ping" };
