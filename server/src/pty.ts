import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findClaudeExecutable } from "./claude.js";

export interface TerminalSessionEvents {
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
}

export interface TerminalSession {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  readonly pid: number | undefined;
  readonly kind: "pty" | "pipe";
}

const WIN = process.platform === "win32";

/** Args to launch an interactive Claude Code session, optionally seeded with a first prompt. */
export function claudeLaunchArgs(
  initialPrompt: string | null,
  skipPermissions: boolean,
): string[] {
  const args: string[] = [];
  if (initialPrompt) args.push(initialPrompt);
  if (skipPermissions) args.push("--dangerously-skip-permissions");
  return args;
}

interface MinimalPty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  readonly pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
}

type PtyFactory = typeof import("node-pty");

let ptyModule: PtyFactory | null | undefined;

/** Lazily load node-pty; returns null when the native module is unavailable. */
async function loadPty(): Promise<PtyFactory | null> {
  if (ptyModule !== undefined) return ptyModule;
  try {
    ptyModule = (await import("node-pty")) as PtyFactory;
    return ptyModule;
  } catch (err) {
    console.warn(
      "[opencrew] node-pty unavailable (%s); falling back to piped child processes.",
      err instanceof Error ? err.message : err,
    );
    ptyModule = null;
    return null;
  }
}

function spawnPty(
  pty: PtyFactory,
  exe: string,
  args: string[],
  cwd: string,
  cols: number,
  rows: number,
): MinimalPty {
  return pty.spawn(exe, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: process.env as Record<string, string>,
  });
}

/**
 * On Windows, `claude` is typically a .cmd shim, so run it through cmd.exe.
 * On POSIX the resolved executable is spawned directly.
 */
function normalizeLaunch(exe: string, args: string[]): { file: string; args: string[] } {
  if (WIN && /\.(cmd|bat)$/i.test(exe)) {
    return { file: "cmd.exe", args: ["/c", exe, ...args] };
  }
  return { file: exe, args };
}

/** Fallback session using piped stdio (no TTY emulation, but fully interactive I/O). */
function spawnPiped(
  exe: string,
  args: string[],
  cwd: string,
  events: TerminalSessionEvents,
): TerminalSession {
  const { file, args: finalArgs } = normalizeLaunch(exe, args);
  const child: ChildProcessWithoutNullStreams = spawn(file, finalArgs, {
    cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (d: Buffer) => events.onData(d.toString()));
  child.stderr.on("data", (d: Buffer) => events.onData(d.toString()));
  child.on("error", (err) => {
    events.onData(`\r\n[opencrew] process error: ${err.message}\r\n`);
    events.onExit(1);
  });
  child.on("exit", (code) => events.onExit(code ?? 1));
  return {
    write: (data) => child.stdin.write(data),
    resize: () => {},
    kill: () => {
      try {
        if (WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
        else child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    },
    get pid() {
      return child.pid;
    },
    kind: "pipe",
  };
}

/**
 * Spawn an interactive Claude Code session in `cwd`.
 * Prefers node-pty for a real terminal; degrades to piped stdio when the
 * native module cannot be loaded on this platform.
 */
export async function spawnClaudeSession(
  cwd: string,
  args: string[],
  cols: number,
  rows: number,
  events: TerminalSessionEvents,
): Promise<TerminalSession> {
  const exe = findClaudeExecutable();
  if (!exe) throw new Error("Claude Code CLI not found. Install it with: npm i -g @anthropic-ai/claude-code");

  fs.mkdirSync(cwd, { recursive: true });
  const { file, args: finalArgs } = normalizeLaunch(exe, args);

  const pty = await loadPty();
  if (pty) {
    try {
      const term = spawnPty(pty, file, finalArgs, cwd, cols, rows);
      term.onData((data) => events.onData(data));
      term.onExit(({ exitCode }) => events.onExit(exitCode));
      return {
        write: (data) => term.write(data),
        resize: (c, r) => {
          try {
            term.resize(c, r);
          } catch {
            /* process may have exited */
          }
        },
        kill: () => {
          try {
            term.kill();
          } catch {
            /* already dead */
          }
        },
        get pid() {
          return term.pid;
        },
        kind: "pty",
      };
    } catch (err) {
      console.warn(
        "[opencrew] node-pty spawn failed (%s); using piped fallback.",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return spawnPiped(exe, finalArgs, cwd, events);
}

export function defaultCols(): number {
  return 120;
}

export function defaultRows(): number {
  return 30;
}

export function homeDir(): string {
  return os.homedir();
}

export function normalizeWorkspace(dir: string): string {
  return path.resolve(dir);
}
