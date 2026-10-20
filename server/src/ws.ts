import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

export type ServerMessage =
  | { type: "project.updated"; projectId: string; project: unknown }
  | { type: "team.created"; projectId: string; agents: unknown[]; edges: unknown[]; positions: unknown }
  | { type: "agent.updated"; projectId: string; agent: unknown }
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

interface ClientState {
  socket: WebSocket;
  projects: Set<string>;
}

export class WsHub {
  private wss = new WebSocketServer({ noServer: true });
  private clients = new Set<ClientState>();

  /** Handler installed by the agent manager to process client messages. */
  onClientMessage: ((msg: ClientMessage, client: ClientState) => void) | null = null;

  attach(server: HttpServer): void {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws));
    });
  }

  private handleConnection(socket: WebSocket): void {
    const client: ClientState = { socket, projects: new Set() };
    this.clients.add(client);
    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === "ping") {
        this.send(client, { type: "pong" });
        return;
      }
      if (msg.type === "subscribe.project" && typeof msg.projectId === "string") {
        client.projects.add(msg.projectId);
        return;
      }
      this.onClientMessage?.(msg, client);
    });
    socket.on("close", () => this.clients.delete(client));
    socket.on("error", () => this.clients.delete(client));
  }

  private send(client: ClientState, message: ServerMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  /** Broadcast to every client subscribed to a project. */
  toProject(projectId: string, message: ServerMessage): void {
    for (const client of this.clients) {
      if (client.projects.has(projectId)) this.send(client, message);
    }
  }
}
