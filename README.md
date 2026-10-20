# OpenCrew

**Build Software with Your AI Crew.**

OpenCrew is a lightweight, open-source, local-first multi-agent software development
platform. Describe a project in natural language and OpenCrew spins up a team of
specialized AI development agents — each an independent Claude Code CLI process —
visualized on an n8n-inspired node canvas with real, interactive terminals.

## Features

- **Visual agent canvas** — infinite React Flow canvas with draggable agent nodes,
  animated edges, zoom/pan, and a subtle dotted grid (dark mode by default)
- **CEO Agent planning** — the CEO analyzes your request via Claude Code's
  non-interactive mode and returns a Zod-validated structured team plan
- **Dynamic agent factory** — specialized agents (frontend, backend, database,
  tester, git, …) are created from reusable instruction templates
- **Real Claude Code terminals** — every agent runs its own `claude` process under
  `node-pty`; watch live output, type into the session, resize, and reconnect
- **Dependency-aware execution** — agents with prerequisites wait until their
  upstream agents complete
- **Local-first persistence** — projects, agents, node positions and settings are
  plain JSON files. No database, no Docker.

## Requirements

- Node.js ≥ 20
- Claude Code CLI installed and authenticated (`claude --version`)
- Python 3 + a C/C++ toolchain (only to compile `node-pty` on install)

## Quick start

```bash
npm install            # installs server + web workspaces (compiles node-pty)
npm run dev            # server on :4000, web on :5173
```

Open http://localhost:5173, describe what you want to build, and watch your crew
appear on the canvas.

### Production build

```bash
npm run build          # builds server + web
npm start              # serves the built frontend from the server on :4000
```

## Configuration

| Env var                | Default        | Description                          |
| ---------------------- | -------------- | ------------------------------------ |
| `OPENCREW_PORT`        | `4000`         | Backend port                         |
| `OPENCREW_DATA_DIR`    | `~/.opencrew`  | Projects, workspaces, settings       |
| `OPENCREW_SKIP_PERMS`  | `1`            | Pass `--dangerously-skip-permissions` to agent sessions |

Settings (including the permissions flag) can also be changed at runtime from the
in-app Settings dialog.

## Architecture

```
server/   Fastify + WebSocket + node-pty backend (TypeScript, ESM)
web/      React + Vite + Tailwind + React Flow + xterm.js frontend
agents/   Markdown instruction templates per role
```

- `POST /api/projects` — create a project from a natural-language request
- `GET /api/projects` / `GET /api/projects/:id` — list / load state
- `POST /api/projects/:id/agents/:agentId/(start|stop|restart)` — control processes
- `WS /ws` — state events + bidirectional terminal streams (base64 frames)

## License

MIT
