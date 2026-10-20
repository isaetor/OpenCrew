import type { AgentStatus } from "../types";

export const statusMeta: Record<
  AgentStatus,
  { label: string; dot: string; text: string; pulse?: boolean }
> = {
  creating: { label: "Creating", dot: "bg-info", text: "text-info" },
  idle: { label: "Idle", dot: "bg-ink-faint", text: "text-ink-dim" },
  running: { label: "Running", dot: "bg-accent status-pulse", text: "text-accent", pulse: true },
  completed: { label: "Completed", dot: "bg-ok", text: "text-ok" },
  failed: { label: "Failed", dot: "bg-danger", text: "text-danger" },
  stopped: { label: "Stopped", dot: "bg-warn", text: "text-warn" },
};
