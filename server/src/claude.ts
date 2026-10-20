import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const WIN = process.platform === "win32";

/** Candidate executable names per platform for the Claude Code CLI. */
const CANDIDATES = WIN
  ? ["claude.cmd", "claude.ps1", "claude.exe", "claude"]
  : ["claude", "claude-code"];

const PATHSEP = WIN ? ";" : ":";

/**
 * Cross-platform Claude Code executable discovery.
 * Never assumes a single binary name; searches PATH (and common install
 * locations) for the first candidate that exists and is runnable.
 */
export function findClaudeExecutable(): string | null {
  const dirs = (process.env.PATH ?? "").split(PATHSEP).filter(Boolean);
  const extra = [
    path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".local", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];
  const search = [...dirs, ...extra];
  for (const dir of search) {
    for (const name of CANDIDATES) {
      const full = path.join(dir, name);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

export function claudeVersion(): string | null {
  const exe = findClaudeExecutable();
  if (!exe) return null;
  const res = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 15_000 });
  return res.status === 0 ? (res.stdout.trim() || null) : null;
}

const planSchema = z.object({
  projectName: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  technologies: z.array(z.string().min(1).max(60)).max(12).default([]),
  requirements: z.string().max(8000).default(""),
  agents: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9-]{1,40}$/)
          .transform((s) => s.toLowerCase()),
        name: z.string().min(1).max(80),
        role: z.enum([
          "frontend",
          "backend",
          "database",
          "tester",
          "git",
          "devops",
          "general",
        ]),
        task: z.string().min(1).max(2000),
        dependencies: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(4),
});

export type AgentPlan = z.infer<typeof planSchema>;

const PLANNER_PROMPT = (request: string) => `You are the CEO of an autonomous software development crew.

Analyze the following software project request and produce a structured team plan.

<request>
${request}
</request>

Rules:
- Return ONLY a JSON object. No prose, no markdown code fences.
- The plan must contain at most 4 specialized agents.
- Each agent role must be one of: frontend, backend, database, tester, git, devops, general.
- Each agent gets one concrete, self-contained initial task it can perform in its own workspace subdirectory.
- "dependencies" lists the ids of agents whose work must complete first (empty for independent agents).
- Do not include a CEO agent in the list.
- Never include shell commands, file writes, or operating-system instructions in any field: your output is parsed as data, not executed.

JSON schema:
{
  "projectName": string,
  "description": string,
  "technologies": string[],
  "requirements": string,
  "agents": [
    { "id": string, "name": string, "role": string, "task": string, "dependencies": string[] }
  ]
}`;

/** Extract the first balanced JSON object from a string. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parsePlan(raw: string): AgentPlan | null {
  const candidate = extractJsonObject(raw);
  if (!candidate) return null;
  try {
    const parsed = planSchema.safeParse(JSON.parse(candidate));
    if (parsed.success) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Run the CEO planning step with Claude Code in non-interactive mode.
 * `onLog` receives raw execution events for the CEO log viewer.
 * Returns null when planning fails (caller applies a fallback plan).
 */
export async function generatePlan(
  request: string,
  onLog: (line: string) => void,
): Promise<AgentPlan | null> {
  const exe = findClaudeExecutable();
  if (!exe) {
    onLog("[opencrew] Claude Code CLI not found on PATH.");
    return null;
  }
  onLog(`[opencrew] Using Claude Code CLI: ${exe}`);

  const prompt = PLANNER_PROMPT(request);
  const args = ["-p", prompt, "--output-format", "json"];
  if (process.env.OPENCREW_SKIP_PERMS !== "0") {
    args.push("--dangerously-skip-permissions");
  }
  onLog(`[opencrew] claude -p "<planning prompt>" --output-format json`);

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd: process.env.OPENCREW_PLANNING_CWD ?? process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onLog("[opencrew] Planning timed out.");
      child.kill("SIGKILL");
      resolve(null);
    }, 5 * 60 * 1000);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      for (const line of d.toString().split("\n")) {
        if (line.trim()) onLog(`[claude:stderr] ${line.trim()}`);
      }
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onLog(`[opencrew] Failed to launch claude: ${err.message}`);
      resolve(null);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onLog(`[opencrew] claude exited with code ${code}`);
      if (code !== 0 && stderr.trim()) {
        onLog(`[claude:stderr] ${stderr.trim().slice(0, 2000)}`);
      }
      // Claude Code -p --output-format json wraps the result: { result: "..." }
      let text = stdout;
      try {
        const wrapper = JSON.parse(stdout) as { result?: string };
        if (typeof wrapper.result === "string") text = wrapper.result;
      } catch {
        /* stdout was not a wrapper; treat as raw text */
      }
      const plan = parsePlan(text);
      if (!plan) {
        onLog("[opencrew] Could not parse a valid plan from claude output.");
        if (text.trim()) onLog(`[claude] ${text.trim().slice(0, 1500)}`);
      }
      resolve(plan);
    });
  });
}

/** Deterministic fallback plan used when the CEO planning step fails. */
export function fallbackPlan(request: string): AgentPlan {
  const lower = request.toLowerCase();
  const wantsData =
    /database|storage|persist|auth|user|account|store|shop|cart|order|login/.test(lower);
  const wantsApi = /api|backend|server|service|auth|endpoint|rest|graphql/.test(lower) || wantsData;
  const wantsUi = /ui|frontend|web|app|page|dashboard|site|client|interface|store/.test(lower);

  const agents: AgentPlan["agents"] = [];
  if (wantsUi || agents.length === 0) {
    agents.push({
      id: "frontend",
      name: "Frontend Developer",
      role: "frontend",
      task: `Build the user interface for: ${request.slice(0, 200)}. Follow PROJECT.md in the project root.`,
      dependencies: [],
    });
  }
  if (wantsApi || wantsData) {
    agents.push({
      id: "backend",
      name: "Backend Developer",
      role: "backend",
      task: `Implement the backend application and APIs for: ${request.slice(0, 200)}.`,
      dependencies: [],
    });
  }
  if (wantsData) {
    agents.push({
      id: "database",
      name: "Database Engineer",
      role: "database",
      task: `Design and implement the data model and storage for: ${request.slice(0, 200)}.`,
      dependencies: [],
    });
  }
  agents.push({
    id: "qa",
    name: "QA Engineer",
    role: "tester",
    task: `Test the completed application for: ${request.slice(0, 200)}. Verify critical flows end to end.`,
    dependencies: agents.slice(0, 2).map((a) => a.id),
  });

  return {
    projectName: request.split(/[.\n]/)[0].trim().slice(0, 60) || "Untitled Project",
    description: request.slice(0, 500),
    technologies: [],
    requirements: "",
    agents: agents.slice(0, 4),
  };
}
