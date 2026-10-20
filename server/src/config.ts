import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const dataDir = process.env.OPENCREW_DATA_DIR
  ? path.resolve(process.env.OPENCREW_DATA_DIR)
  : path.join(os.homedir(), ".opencrew");

export const config = {
  port: Number(process.env.OPENCREW_PORT ?? 4000),
  host: process.env.OPENCREW_HOST ?? "0.0.0.0",
  dataDir,
  projectsDir: path.join(dataDir, "projects"),
  workspacesDir: path.join(dataDir, "workspaces"),
  settingsFile: path.join(dataDir, "settings.json"),
  maxSpecializedAgents: 4,
  terminalBacklogBytes: 256 * 1024,
  planTimeoutMs: 5 * 60 * 1000,
};

export function ensureDataDirs(): void {
  for (const dir of [config.dataDir, config.projectsDir, config.workspacesDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
