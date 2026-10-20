import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { api } from "../api";
import { closePanel, setState, useStore } from "../store";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { roleIcons, roleLabels } from "./AgentNode";
import { statusMeta } from "./status";
import { TerminalView } from "./Terminal";

const MIN_WIDTH = 420;
const MAX_RATIO = 0.92;

export function DetailsPanel(): React.JSX.Element | null {
  const project = useStore((s) => s.activeProject);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const panelOpen = useStore((s) => s.panelOpen);
  const fullscreen = useStore((s) => s.panelFullscreen);
  const [width, setWidth] = useState(520);
  const [showInstructions, setShowInstructions] = useState(false);
  const dragging = useRef(false);

  const agent = project?.agents.find((a) => a.id === selectedAgentId) ?? null;

  const onDrag = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const max = window.innerWidth * MAX_RATIO;
    setWidth(Math.min(max, Math.max(MIN_WIDTH, window.innerWidth - e.clientX)));
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, [onDrag, stopDrag]);

  if (!panelOpen || !project || !agent) return null;

  const status = statusMeta[agent.status];
  const Icon = roleIcons[agent.role] ?? roleIcons.general;
  const effectiveWidth = fullscreen ? window.innerWidth * MAX_RATIO : width;

  const action = (name: "start" | "stop" | "restart") => () =>
    void api.agentAction(project.id, agent.id, name).catch(() => {});

  return (
    <div
      className="absolute right-0 top-0 z-20 flex h-full flex-col border-l border-line bg-panel shadow-2xl shadow-black/50"
      style={{ width: effectiveWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={() => {
          dragging.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        className="absolute -left-1 top-0 z-30 h-full w-2 cursor-col-resize hover:bg-accent/20"
      />

      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2 text-accent">
          <Icon size={17} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-ink">{agent.name}</h2>
            <span className={cn("flex items-center gap-1 text-[11px] font-medium", status.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <p className="truncate text-[11px] text-ink-faint">
            {roleLabels[agent.role] ?? agent.role}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={fullscreen ? "Exit fullscreen" : "Expand terminal"}
            onClick={() => setState({ panelFullscreen: !fullscreen })}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
          <Button variant="ghost" size="icon" title="Close panel" onClick={() => closePanel()}>
            <X size={15} />
          </Button>
        </div>
      </header>

      <div className="space-y-3 border-b border-line px-4 py-3">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Current task
          </div>
          <p className="text-xs leading-relaxed text-ink-dim">{agent.task || "—"}</p>
        </div>
        {agent.dependencies.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Depends on
            </span>
            {agent.dependencies.map((d) => (
              <Badge key={d}>{d}</Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {agent.status === "running" ? (
            <Button variant="danger" size="sm" onClick={action("stop")}>
              <Square size={12} /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={action("start")}>
              <Play size={12} /> Start
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={action("restart")}>
            <RotateCcw size={12} /> Restart
          </Button>
          <span className="ml-auto truncate font-mono text-[10px] text-ink-faint" title={agent.workspace}>
            {agent.workspace}
          </span>
        </div>
      </div>

      <button
        onClick={() => setShowInstructions((v) => !v)}
        className="flex items-center gap-1.5 border-b border-line px-4 py-2 text-[11px] font-medium text-ink-dim hover:text-ink"
      >
        <ChevronDown
          size={12}
          className={cn("transition-transform", showInstructions && "rotate-180")}
        />
        Agent instructions
      </button>
      {showInstructions && (
        <div className="max-h-44 overflow-auto border-b border-line bg-panel-2/50 px-4 py-3">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
            {agent.instructions}
          </pre>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <TerminalView projectId={project.id} agentId={agent.id} running={agent.status === "running"} />
      </div>
    </div>
  );
}
