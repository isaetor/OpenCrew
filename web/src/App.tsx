import { Sidebar } from "./components/Sidebar";
import { Canvas } from "./components/Canvas";
import { wireSocket, useStore } from "./store";
import { cn } from "./lib/utils";
import { useEffect } from "react";

export default function App(): React.JSX.Element {
  useEffect(() => {
    wireSocket();
  }, []);

  const connection = useStore((s) => s.connection);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="relative min-w-0 flex-1">
        <Canvas />
        <div
          className={cn(
            "absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-line bg-panel/90 px-2.5 py-1 text-[10px] backdrop-blur",
            connection === "open" ? "text-ink-faint" : "text-danger",
          )}
          title={connection === "open" ? "Connected to OpenCrew server" : "Connection lost — retrying"}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connection === "open" ? "bg-ok" : "bg-danger status-pulse",
            )}
          />
          {connection === "open" ? "live" : "offline"}
        </div>
      </main>
    </div>
  );
}
