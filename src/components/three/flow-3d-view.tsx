"use client";

import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { Button } from "@/components/ui/button";

// three.js proof-of-life (roadmap Phase 0.2): renders the current graph as an
// orbitable WebGL scene. First real @react-three/fiber surface in the app —
// the existing stack-3d-math SVG/canvas views stay until features need
// migrating, so this component is the beachhead, not a rewrite.

const SCALE = 0.01; // canvas px -> world units

function GraphScene() {
  const nodes = useNodeEditorStore((s) => s.nodes);
  const edges = useNodeEditorStore((s) => s.edges);

  // Center the graph around the origin so orbit controls pivot on it.
  const center = useMemo(() => {
    if (nodes.length === 0) return { x: 0, y: 0 };
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }, [nodes]);

  const pos = (nx: number, ny: number): [number, number, number] => [
    (nx - center.x) * SCALE,
    -(ny - center.y) * SCALE, // canvas y grows downward; world y grows up
    0,
  ];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 8]} intensity={1.1} />
      {nodes.map((n) => {
        const running = n.data.executionState === "running";
        const error = n.data.executionState === "error";
        return (
          <group key={n.id} position={pos(n.position.x, n.position.y)}>
            <mesh>
              <boxGeometry args={[1.4, 0.7, 0.35]} />
              <meshStandardMaterial
                color={error ? "#7f1d1d" : running ? "#b45309" : "#27272a"}
                emissive={running ? "#f59e0b" : "#000000"}
                emissiveIntensity={running ? 0.4 : 0}
              />
            </mesh>
            <Text position={[0, 0, 0.2]} fontSize={0.16} color="#e4e4e7" maxWidth={1.3} anchorX="center" anchorY="middle">
              {n.data.label}
            </Text>
          </group>
        );
      })}
      {edges.map((e) => {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (!s || !t) return null;
        return (
          <Line
            key={e.id}
            points={[pos(s.position.x + 90, s.position.y), pos(t.position.x - 90, t.position.y)]}
            color={e.animated ? "#f59e0b" : "#3f3f46"}
            lineWidth={e.animated ? 2.5 : 1.2}
          />
        );
      })}
    </>
  );
}

export default function Flow3DView({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-xl z-50 flex flex-col select-none">
      <div className="flex items-center justify-between px-6 pt-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Flow 3D Preview</h2>
          <p className="text-xs text-zinc-500">Orbit with the mouse — live node states light up while flows run</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="h-8 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200">
          Close (ESC)
        </Button>
      </div>
      <div className="flex-1">
        <Canvas camera={{ position: [0, 0, 9], fov: 50 }}>
          <GraphScene />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
    </div>
  );
}
