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

export interface Settings {
  skipPermissions: boolean;
}
