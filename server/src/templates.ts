import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templatesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../agents",
);

const cache = new Map<string, string>();

export function loadTemplate(role: string): string {
  const key = role.toLowerCase();
  const file = path.join(templatesDir, `${key}.md`);
  const fallback = path.join(templatesDir, "general.md");
  const target = fs.existsSync(file) ? file : fallback;
  let cached = cache.get(target);
  if (!cached) {
    cached = fs.readFileSync(target, "utf8");
    cache.set(target, cached);
  }
  return cached;
}

export function renderInstructions(role: string, vars: Record<string, string>): string {
  let text = loadTemplate(role);
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}
