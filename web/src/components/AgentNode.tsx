import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Database,
  FlaskConical,
  GitBranch,
  Monitor,
  Network,
  Server,
  SquareTerminal,
  Cloud,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { Agent, AgentRole } from "../types";
import { statusMeta } from "./status";

export const roleIcons: Record<AgentRole, LucideIcon> = {
  ceo: Network,
  frontend: Monitor,
  backend: Server,
  database: Database,
  tester: FlaskConical,
  git: GitBranch,
  devops: Cloud,
  general: Bot,
};

export const roleLabels: Record<AgentRole, string> = {
  ceo: "Chief Executive Officer",
  frontend: "Frontend Developer",
  backend: "Backend Developer",
  database: "Database Engineer",
  tester: "QA Engineer",
  git: "Git & Release",
  devops: "DevOps Engineer",
  general: "Developer",
};

export type AgentNodeData = {
  agent: Agent;
  entranceDelay: number;
  animateEntrance: boolean;
};

function AgentNodeInner({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  const { agent, entranceDelay, animateEntrance } = data;
  const Icon = roleIcons[agent.role] ?? Bot;
  const status = statusMeta[agent.status];

  return (
    <div
      className={cn(
        "agent-node w-72 rounded-xl border bg-panel shadow-lg shadow-black/40 transition-colors",
        selected ? "border-accent" : "border-line hover:border-line/80",
        animateEntrance && "agent-node-enter",
      )}
      style={animateEntrance ? { animationDelay: `${entranceDelay}ms` } : undefined}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flex items-center gap-2.5 border-b border-line-soft px-3.5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2 text-accent">
          <Icon size={16} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{agent.name}</div>
          <div className="truncate text-[11px] text-ink-faint">
            {roleLabels[agent.role] ?? agent.role}
          </div>
        </div>
      </div>

      <div className="space-y-2 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
          <span className={cn("text-[11px] font-medium", status.text)}>{status.label}</span>
          {agent.exitCode !== null && agent.exitCode !== 0 && (
            <span className="text-[10px] text-ink-faint">exit {agent.exitCode}</span>
          )}
        </div>
        <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-ink-dim">
          {agent.task || "Awaiting task…"}
        </p>
      </div>

      <div className="border-t border-line-soft px-3.5 py-2">
        <div className="flex items-center justify-between text-[11px] text-ink-faint">
          <span className="truncate font-mono">/{agent.id}</span>
          <span className="flex items-center gap-1 text-ink-dim">
            <SquareTerminal size={12} />
            Terminal
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const AgentNode = memo(AgentNodeInner);
