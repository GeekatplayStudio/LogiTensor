"use client";

import React, { useMemo } from "react";
import { Hub } from "./use-node-editor-store";
import { Camera, project } from "@/lib/stack-3d-math";

// Renders the zoomed-out Federation level: every hub as a wireframe cube with
// its layers visible as glass slices inside, linked by glowing channel curves
// between hubs that share federated nodes (matched by node label = channel).

const CUBE_HALF = 96;

interface Props {
  cam: Camera;
  hubs: Hub[];
  activeHubId: string;
  onSelectHub: (id: string) => void;
  onEnterHub: (id: string) => void;
}

interface HubPose {
  hub: Hub;
  cx: number;
  cy: number; // world y (vertical float offset)
  cz: number;
  depth: number;
}

// Cube face definitions as corner multipliers [x, y, z] of CUBE_HALF
const FACES: [number, number, number][][] = [
  [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], // front
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],     // back
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // left
  [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]],     // right
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // top
  [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],     // bottom
];

export default function FederationScene({ cam, hubs, activeHubId, onSelectHub, onEnterHub }: Props) {
  // Hubs float on a ring, with a slight per-hub vertical drift for the
  // organic "neural cluster" feel instead of a rigid mechanical circle.
  const poses = useMemo<HubPose[]>(() => {
    const n = hubs.length;
    const radius = n <= 1 ? 0 : Math.max(300, n * 95);
    return hubs.map((hub, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = (i % 3 - 1) * 46;
      const center = project(cx, cy, cz, cam);
      return { hub, cx, cy, cz, depth: center.depth };
    });
  }, [hubs, cam]);

  // Channels: federated nodes grouped by label; hubs sharing a channel link up.
  const links = useMemo(() => {
    const channels = new Map<string, Set<string>>();
    for (const hub of hubs)
      for (const layer of hub.layers)
        for (const node of layer.nodes) {
          if (node.data.config?.isFederated) {
            const ch = String(node.data.label || "link").trim();
            if (!channels.has(ch)) channels.set(ch, new Set());
            channels.get(ch)!.add(hub.id);
          }
        }
    const out: { channel: string; a: string; b: string }[] = [];
    for (const [channel, hubIds] of channels) {
      const ids = [...hubIds];
      for (let i = 0; i < ids.length - 1; i++) {
        out.push({ channel, a: ids[i], b: ids[i + 1] });
      }
    }
    return out;
  }, [hubs]);

  const poseById = useMemo(() => new Map(poses.map((p) => [p.hub.id, p])), [poses]);

  // Painter's algorithm: farthest hubs first.
  const drawOrder = useMemo(() => [...poses].sort((a, b) => b.depth - a.depth), [poses]);

  const renderHub = (pose: HubPose) => {
    const { hub, cx, cy, cz } = pose;
    const active = hub.id === activeHubId;
    const h = CUBE_HALF * (active ? 1.12 : 1);
    const stroke = active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.4)";

    const faceEls = FACES.map((face, fi) => {
      const pts = face.map(([mx, my, mz]) => project(cx + mx * h, cy + my * h, cz + mz * h, cam));
      const depth = pts.reduce((s, p) => s + p.depth, 0) / 4;
      const d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
      return { fi, depth, d };
    }).sort((a, b) => b.depth - a.depth);

    // Layers as horizontal glass slices stacked inside the cube
    const sliceCount = Math.min(hub.layers.length, 5);
    const slices = Array.from({ length: sliceCount }, (_, j) => {
      const y = cy + h - ((j + 1) * (2 * h)) / (sliceCount + 1);
      const inset = h - 16;
      const pts = [
        project(cx - inset, y, cz - inset, cam),
        project(cx + inset, y, cz - inset, cam),
        project(cx + inset, y, cz + inset, cam),
        project(cx - inset, y, cz + inset, cam),
      ];
      return `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
    });

    const top = project(cx, cy - h - 30, cz, cam);
    const fedCount = hub.layers.reduce(
      (s, l) => s + l.nodes.filter((n) => n.data.config?.isFederated).length,
      0
    );

    return (
      <g
        key={hub.id}
        onClick={() => onSelectHub(hub.id)}
        onDoubleClick={() => onEnterHub(hub.id)}
        className="cursor-pointer"
        opacity={active ? 1 : 0.72}
        style={{ transition: "opacity 0.3s" }}
      >
        {faceEls.map((f) => (
          <path
            key={f.fi}
            d={f.d}
            fill={active ? "rgba(34,211,238,0.045)" : "rgba(255,255,255,0.02)"}
            stroke={stroke}
            strokeWidth={active ? 1.4 : 0.9}
            filter={active ? "url(#lsv-glow)" : undefined}
          />
        ))}
        {slices.map((d, j) => (
          <path key={j} d={d} fill="rgba(34,211,238,0.05)" stroke="rgba(103,232,249,0.4)" strokeWidth={0.8} />
        ))}
        <text x={top.x} y={top.y} textAnchor="middle" fontSize={active ? 16 : 13} fontWeight={600} fill={active ? "#a5f3fc" : "#94a3b8"}>
          {hub.name}
        </text>
        <text x={top.x} y={top.y + 15} textAnchor="middle" fontSize={9.5} fill="#64748b">
          {hub.layers.length} dim · {fedCount} fed
        </text>
      </g>
    );
  };

  return (
    <g>
      {drawOrder.map(renderHub)}
      {links.map((link, i) => {
        const pa = poseById.get(link.a);
        const pb = poseById.get(link.b);
        if (!pa || !pb) return null;
        const p1 = project(pa.cx, pa.cy, pa.cz, cam);
        const p2 = project(pb.cx, pb.cy, pb.cz, cam);
        const qx = (p1.x + p2.x) / 2;
        const qy = Math.min(p1.y, p2.y) - 130;
        const d = `M ${p1.x} ${p1.y} Q ${qx} ${qy} ${p2.x} ${p2.y}`;
        return (
          <g key={`fed_${i}`} pointerEvents="none">
            <path d={d} fill="none" stroke="url(#lsv-fed)" strokeWidth={2} opacity={0.9} filter="url(#lsv-glow)" className="lsv-flow" />
            <circle r={3.4} fill="#f0abfc" filter="url(#lsv-glow)">
              <animateMotion dur="3s" repeatCount="indefinite" path={d} />
            </circle>
            <text x={qx} y={qy + 58} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#e879f9" opacity={0.85}>
              {link.channel}
            </text>
          </g>
        );
      })}
    </g>
  );
}
