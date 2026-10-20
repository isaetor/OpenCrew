import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { createProject, useStore } from "../store";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const EXAMPLES = [
  "A fullstack e-commerce platform with cart, checkout and admin panel",
  "A REST API for a personal finance tracker with PostgreSQL",
  "A real-time chat web app with rooms and presence",
];

export function WelcomeOverlay(): React.JSX.Element {
  const [request, setRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const connection = useStore((s) => s.connection);

  const submit = async () => {
    const text = request.trim();
    if (text.length < 3 || submitting) return;
    setSubmitting(true);
    try {
      await createProject(text);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="welcome-in w-[560px] max-w-[92%] rounded-2xl border border-line bg-panel/95 p-7 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="mb-1 flex items-center gap-2 text-accent">
          <Sparkles size={15} />
          <span className="text-[11px] font-semibold uppercase tracking-widest">OpenCrew</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Welcome to OpenCrew</h1>
        <p className="mt-1 text-sm text-ink-dim">Your AI-powered software development team.</p>

        <div className="mt-5">
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            autoFocus
            rows={4}
            disabled={submitting}
            placeholder="Describe your software project…"
            className="w-full resize-none rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setRequest(ex)}
                disabled={submitting}
                className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-[11px] text-ink-faint transition-colors hover:border-accent/40 hover:text-ink-dim disabled:opacity-50"
              >
                {ex.length > 44 ? `${ex.slice(0, 44)}…` : ex}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className={cn("text-[11px]", connection === "open" ? "text-ink-faint" : "text-danger")}>
            {connection === "open" ? "⌘/Ctrl + Enter to create" : "Reconnecting to server…"}
          </span>
          <Button size="lg" onClick={() => void submit()} disabled={submitting || request.trim().length < 3}>
            {submitting ? "Creating…" : "Create Project"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
