import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Project, Settings } from "./types.js";

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function projectFile(id: string): string {
  return path.join(config.projectsDir, `${id}.json`);
}

export function loadProject(id: string): Project | null {
  const v = readJson<{ project?: Project } | null>(projectFile(id), null);
  return v?.project ?? null;
}

export function saveProject(project: Project): void {
  writeJson(projectFile(project.id), { project });
}

export function listProjects(): Project[] {
  try {
    const files = fs
      .readdirSync(config.projectsDir)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => (b > a ? 1 : -1));
    const projects: Project[] = [];
    for (const f of files) {
      const content = readJson<unknown | null>(path.join(config.projectsDir, f), null);
      const p = (content && typeof content === "object" && "project" in content
        ? (content as { project?: Project }).project
        : (content as Project | null)) ?? null;
      if (p && p.id) projects.push(p);
    }
    return projects.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function deleteProject(id: string): void {
  try {
    fs.rmSync(projectFile(id), { force: true });
    fs.rmSync(path.join(config.workspacesDir, id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  const s = readJson<Partial<Settings>>(config.settingsFile, {});
  return {
    skipPermissions: s.skipPermissions ?? process.env.OPENCREW_SKIP_PERMS !== "0",
  };
}

export function saveSettings(settings: Settings): void {
  writeJson(config.settingsFile, settings);
}
