import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type ProOptions,
} from "@xyflow/react";
import { api } from "../api";
import { selectAgent, useStore } from "../store";
import { AgentNode, type AgentNodeData } from "./AgentNode";
import { DetailsPanel } from "./DetailsPanel";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { statusMeta } from "./status";

const nodeTypes = { agent: AgentNode };
const proOptions: ProOptions = { hideAttribution: true };

function CanvasInner(): React.JSX.Element {
  const project = useStore((s) => s.activeProject);
  const selectedAgentId = useStore((s) => s.selectedAgentId);
  const agentCount = project?.agents.length ?? 0;
  const [nodes, setNodes] = useState<Node<AgentNodeData>[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const saveTimer = useRef<number | null>(null);
  const { fitView } = useReactFlow();

  // Sync server project state into React Flow nodes.
  useEffect(() => {
    if (!project) {
      setNodes([]);
      seenIds.current = new Set();
      return;
    }
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return project.agents.map((a, i) => {
        const existing = prevById.get(a.id);
        const position = project.positions[a.id] ?? existing?.position ?? { x: i * 340, y: 0 };
        const animate = !seenIds.current.has(a.id);
        seenIds.current.add(a.id);
        return {
          id: a.id,
          type: "agent" as const,
          position,
          selected: a.id === selectedAgentId,
          data: { agent: a, entranceDelay: Math.min(i * 160, 1600), animateEntrance: animate },
        };
      });
    });
  }, [project, selectedAgentId]);

  // Fit the view once the full team has appeared.
  useEffect(() => {
    if (agentCount > 1) {
      const t = window.setTimeout(() => void fitView({ padding: 0.25, duration: 700 }), 1200);
      return () => window.clearTimeout(t);
    }
  }, [agentCount, fitView]);

  const edges: Edge[] = useMemo(() => {
    if (!project) return [];
    const statusById = new Map(project.agents.map((a) => [a.id, a.status]));
    return project.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "default",
      animated:
        statusMeta[statusById.get(e.source) ?? "idle"].pulse ||
        statusMeta[statusById.get(e.target) ?? "idle"].pulse,
    }));
  }, [project]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<AgentNodeData>>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      const moved = changes.some((c) => c.type === "position" && c.dragging === false);
      if (moved && project) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          setNodes((nds) => {
            const positions: Record<string, { x: number; y: number }> = {};
            for (const n of nds) positions[n.id] = n.position;
            void api.saveLayout(project.id, positions).catch(() => {});
            return nds;
          });
        }, 600);
      }
    },
    [project],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id !== selectedAgentId) selectAgent(node.id);
    },
    [selectedAgentId],
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow<Node<AgentNodeData>>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => selectAgent(null)}
        fitView
        fitViewOptions={{ padding: 0.25, duration: 600 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={proOptions}
        deleteKeyCode={null}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#232b38" />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {project && <PlanningBanner />}
      {!project && <WelcomeOverlay />}
      <DetailsPanel />
    </div>
  );
}

function PlanningBanner(): React.JSX.Element | null {
  const project = useStore((s) => s.activeProject);
  if (!project || project.status !== "planning") return null;
  return (
    <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
      <div className="welcome-in flex items-center gap-2.5 rounded-full border border-line bg-panel/90 px-4 py-2 text-xs text-ink-dim shadow-lg shadow-black/30 backdrop-blur">
        <span className="status-pulse h-1.5 w-1.5 rounded-full bg-accent" />
        CEO Agent is analyzing your request and assembling the team…
      </div>
    </div>
  );
}

export function Canvas(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
