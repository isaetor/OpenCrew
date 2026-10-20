import type { ClientMessage, ServerMessage } from "./types";

type Listener = (data: string) => void;

/**
 * Terminal output bus. Keeps terminal data out of React state: chunks are
 * pushed straight into xterm via listeners, plus a bounded backlog per agent
 * so a freshly opened panel can replay history.
 */
class TerminalBus {
  private backlogs = new Map<string, string>();
  private listeners = new Map<string, Set<Listener>>();
  private max = 256 * 1024;

  private key(projectId: string, agentId: string): string {
    return `${projectId}:${agentId}`;
  }

  push(projectId: string, agentId: string, data: string): void {
    const k = this.key(projectId, agentId);
    let backlog = this.backlogs.get(k) ?? "";
    backlog += data;
    if (backlog.length > this.max) backlog = backlog.slice(backlog.length - this.max);
    this.backlogs.set(k, backlog);
    for (const l of this.listeners.get(k) ?? []) l(data);
  }

  setBacklog(projectId: string, agentId: string, data: string): void {
    const k = this.key(projectId, agentId);
    this.backlogs.set(k, data.slice(-this.max));
    for (const l of this.listeners.get(k) ?? []) l(data);
  }

  backlog(projectId: string, agentId: string): string {
    return this.backlogs.get(this.key(projectId, agentId)) ?? "";
  }

  subscribe(projectId: string, agentId: string, fn: Listener): () => void {
    const k = this.key(projectId, agentId);
    let set = this.listeners.get(k);
    if (!set) {
      set = new Set();
      this.listeners.set(k, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  clear(projectId: string): void {
    for (const k of [...this.backlogs.keys()]) {
      if (k.startsWith(`${projectId}:`)) this.backlogs.delete(k);
    }
  }
}

export const terminalBus = new TerminalBus();

type StateHandler = (msg: ServerMessage) => void;

class Api {
  private ws: WebSocket | null = null;
  private handlers = new Set<StateHandler>();
  private queue: ClientMessage[] = [];
  private retry = 0;
  private closedByUser = false;

  onMessage(fn: StateHandler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  connect(): void {
    this.closedByUser = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      for (const m of this.queue.splice(0)) this.send(m);
      for (const h of this.handlers) h({ type: "pong" });
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      const delay = Math.min(5000, 800 * ++this.retry);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  createProject(request: string) {
    return this.json<{ project: import("./types").Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ request }),
    });
  }

  listProjects() {
    return this.json<{ projects: import("./types").ProjectSummary[] }>("/api/projects");
  }

  getProject(id: string) {
    return this.json<{ project: import("./types").Project }>(`/api/projects/${id}`);
  }

  deleteProject(id: string) {
    return this.json<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" });
  }

  saveLayout(id: string, positions: Record<string, { x: number; y: number }>) {
    return this.json<{ ok: boolean }>(`/api/projects/${id}/layout`, {
      method: "PATCH",
      body: JSON.stringify({ positions }),
    });
  }

  agentAction(id: string, agentId: string, action: "start" | "stop" | "restart") {
    return this.json<{ ok: boolean }>(`/api/projects/${id}/agents/${agentId}/${action}`, {
      method: "POST",
    });
  }

  getHealth() {
    return this.json<import("./types").Health>("/api/health");
  }

  getSettings() {
    return this.json<import("./types").Settings>("/api/settings");
  }

  putSettings(s: import("./types").Settings) {
    return this.json<import("./types").Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(s),
    });
  }
}

export const api = new Api();
