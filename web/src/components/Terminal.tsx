import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api, terminalBus } from "../api";
import { useStore } from "../store";
import { cn } from "../lib/utils";
import { CircleOff, Wifi, WifiOff } from "lucide-react";

function b64(data: string): string {
  const bytes = new TextEncoder().encode(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface TerminalViewProps {
  projectId: string;
  agentId: string;
  running: boolean;
}

export function TerminalView({ projectId, agentId, running }: TerminalViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const connection = useStore((s) => s.connection);
  const kind = useStore((s) => s.terminalKinds[agentId] ?? null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: false,
      theme: {
        background: "#0d1118",
        foreground: "#d5dde8",
        cursor: "#2dd4bf",
        selectionBackground: "#2dd4bf33",
        black: "#0d1118",
        red: "#f87171",
        green: "#34d399",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#2dd4bf",
        white: "#e6ebf2",
        brightBlack: "#5b6472",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    term.write(terminalBus.backlog(projectId, agentId));

    const unsubscribe = terminalBus.subscribe(projectId, agentId, (data) => term.write(data));
    const inputDisposable = term.onData((data) => {
      if (running) api.send({ type: "terminal.input", projectId, agentId, data: b64(data) });
    });

    const doFit = () => {
      try {
        fit.fit();
        const { cols, rows } = term;
        api.send({ type: "terminal.resize", projectId, agentId, cols, rows });
      } catch {
        /* container hidden */
      }
    };
    doFit();
    const observer = new ResizeObserver(doFit);
    observer.observe(host);

    return () => {
      observer.disconnect();
      unsubscribe();
      inputDisposable.dispose();
      term.dispose();
    };
    // Recreate the terminal when switching agents or when a new process starts.
  }, [projectId, agentId, running]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-[#0d1118]">
      <div className="flex items-center justify-between border-b border-line-soft bg-panel px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          {connection === "open" ? (
            <Wifi size={11} className="text-ok" />
          ) : (
            <WifiOff size={11} className="text-danger" />
          )}
          {connection === "open" ? "Connected" : "Reconnecting…"}
          {kind && <span className="text-ink-faint">· {kind === "pty" ? "PTY" : "piped"}</span>}
        </span>
        <span className="font-mono">claude · {agentId}</span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" />
      {!running && (
        <div
          className={cn(
            "absolute inset-0 top-8 z-10 flex flex-col items-center justify-center gap-2 bg-canvas/80 backdrop-blur-[2px]",
          )}
        >
          <CircleOff size={20} className="text-ink-faint" />
          <p className="text-xs text-ink-dim">Agent is not running</p>
          <p className="text-[11px] text-ink-faint">Use the controls above to start it.</p>
        </div>
      )}
    </div>
  );
}
