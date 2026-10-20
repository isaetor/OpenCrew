import { useState } from "react";
import {
  Bot,
  CircleUserRound,
  FolderKanban,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { openProject, refreshProjects, setState, useStore } from "../store";
import { cn } from "../lib/utils";
import { SettingsDialog } from "./SettingsDialog";
import type { ProjectSummary } from "../types";

const statusColor: Record<ProjectSummary["status"], string> = {
  planning: "bg-info",
  active: "bg-ok",
  failed: "bg-danger",
};

export function Sidebar(): React.JSX.Element {
  const projects = useStore((s) => s.projects);
  const activeProject = useStore((s) => s.activeProject);
  const health = useStore((s) => s.health);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Bot size={17} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-ink">OpenCrew</div>
          <div className="text-[10px] text-ink-faint">Build software with your AI crew</div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
          Projects
        </span>
        <button
          title="New project"
          onClick={() => setState({ activeProject: null, selectedAgentId: null, panelOpen: false })}
          className="text-ink-faint transition-colors hover:text-accent"
        >
          <Plus size={14} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
        {projects.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-ink-faint">
            No projects yet. Describe what you want to build on the canvas.
          </p>
        )}
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => void openProject(p.id).catch(() => {})}
            className={cn(
              "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
              activeProject?.id === p.id
                ? "bg-panel-2 text-ink"
                : "text-ink-dim hover:bg-panel-2/60 hover:text-ink",
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor[p.status])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{p.name}</span>
              <span className="block text-[10px] text-ink-faint">
                {p.agentCount > 0 ? `${p.agentCount} agents` : "planning…"}
              </span>
            </span>
            <span
              role="button"
              tabIndex={-1}
              title="Delete project"
              onClick={(e) => {
                e.stopPropagation();
                void api.deleteProject(p.id).then(() => refreshProjects());
              }}
              className="hidden text-ink-faint hover:text-danger group-hover:block"
            >
              <Trash2 size={12} />
            </span>
          </button>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-line p-2">
        <SidebarItem icon={FolderKanban} label="Workspace" hint={health?.dataDir} />
        <SidebarItem icon={Settings2} label="Settings" onClick={() => setShowSettings(true)} />
        <div className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[10px] text-ink-faint">
          <CircleUserRound size={11} />
          <span className="truncate">
            claude {health?.claudeVersion ?? "not found"}
          </span>
        </div>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </aside>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Bot;
  label: string;
  hint?: string;
  onClick?: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-dim transition-colors hover:bg-panel-2/60 hover:text-ink"
    >
      <Icon size={14} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {hint && <span className="max-w-24 truncate text-[10px] text-ink-faint">{hint}</span>}
    </button>
  );
}
