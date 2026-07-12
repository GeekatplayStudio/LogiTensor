import React, { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useNodeEditorStore } from "./use-node-editor-store";
import { nodeTypes } from "./custom-nodes";
import RadialMenu from "./radial-menu";
import { MUTED_COLORS } from "@/lib/node-styles";

function FlowCanvas() {
  const nodes = useNodeEditorStore((state) => state.nodes);
  const edges = useNodeEditorStore((state) => state.edges);
  const onNodesChange = useNodeEditorStore((state) => state.onNodesChange);
  const onEdgesChange = useNodeEditorStore((state) => state.onEdgesChange);
  const onConnect = useNodeEditorStore((state) => state.onConnect);
  const addNode = useNodeEditorStore((state) => state.addNode);

  const { screenToFlowPosition } = useReactFlow();

  const [radialMenu, setRadialMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Shift slightly so node is placed relative to where cursor dropped
      addNode(type, position.x - 100, position.y - 50);
    },
    [screenToFlowPosition, addNode]
  );

  const onPaneContextMenu = useCallback((event: any) => {
    event.preventDefault();
    setRadialMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const closeRadialMenu = useCallback(() => {
    setRadialMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Custom connection line style (curved, glowing, thin)
  const connectionLineStyle = {
    stroke: MUTED_COLORS.amber,
    strokeWidth: 2,
    strokeDasharray: "4,4",
  };

  return (
    <div className="flex-1 h-full relative" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onPaneContextMenu={onPaneContextMenu}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={connectionLineStyle}
        defaultEdgeOptions={{
          style: { stroke: "#3f3f46", strokeWidth: 2 },
          animated: false,
        }}
        fitView
        colorMode="dark"
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={16} size={1} />
        <Controls className="bg-zinc-900 border border-zinc-800 text-zinc-300 fill-zinc-300 [&_button]:border-zinc-800 [&_button]:bg-zinc-900 [&_button]:text-zinc-300 [&_button:hover]:bg-zinc-800" />
        <MiniMap
          style={{ background: "#09090b", border: "1px solid #27272a" }}
          nodeColor={(n) => {
            if (["triggerInput", "constNum", "constBool", "constString"].includes(n.type || "")) return MUTED_COLORS.blue;
            if (["ifElseTrigger", "condValue", "delayNode", "counterNode", "forLoopNode", "whileLoopNode"].includes(n.type || "")) return MUTED_COLORS.purple;
            if (["compareNode", "expressionNode", "mathNode", "mathFunctionNode", "randomNode"].includes(n.type || "")) return MUTED_COLORS.amber;
            if (["filterNode", "stringOpNode", "replaceTextNode"].includes(n.type || "")) return MUTED_COLORS.emerald;
            if (["loggerNode", "textOutputNode"].includes(n.type || "")) return MUTED_COLORS.rose;
            return MUTED_COLORS.teal;
          }}
          maskColor="rgba(9, 9, 11, 0.7)"
        />
      </ReactFlow>

      {/* Interactive Radial Context Menu */}
      <RadialMenu
        isOpen={radialMenu.isOpen}
        x={radialMenu.x}
        y={radialMenu.y}
        onClose={closeRadialMenu}
      />
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
