import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";
import { setState, useStore } from "../store";
import { Button } from "./ui/button";
import type { Settings } from "../types";

export function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useStore((s) => s.settings);
  const health = useStore((s) => s.health);
  const [skip, setSkip] = useState(settings?.skipPermissions ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      const next: Settings = { skipPermissions: skip };
      const saved = await api.putSettings(next);
      setState({ settings: saved });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="welcome-in w-[440px] max-w-[92%] rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="space-y-4 text-xs text-ink-dim">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel-2/50 p-3">
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block font-medium text-ink">Skip permission prompts</span>
              <span className="mt-0.5 block leading-relaxed text-ink-faint">
                Launch agent sessions with <code className="font-mono text-[10px]">--dangerously-skip-permissions</code> so
                they can work autonomously. Applies to newly started sessions.
              </span>
            </span>
          </label>

          <div className="space-y-1 rounded-xl border border-line bg-panel-2/50 p-3">
            <Row label="OpenCrew version" value={health?.version ?? "—"} />
            <Row label="Claude Code CLI" value={health?.claudeVersion ?? "not found"} />
            <Row label="Platform" value={health?.platform ?? "—"} />
            <Row label="Data directory" value={health?.dataDir ?? "—"} mono />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-faint">{label}</span>
      <span className={`max-w-56 truncate ${mono ? "font-mono text-[10px]" : ""} text-ink-dim`}>{value}</span>
    </div>
  );
}
