import { Node, Edge } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { toast } from "sonner";

/**
 * Serializes the canvas node structure and downloads it as a JSON file.
 */
export function serializeAndSave(nodes: Node<NodeData>[], edges: Edge[]) {
  const payload = JSON.stringify({ nodes, edges }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `logiboard_algorithm_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Algorithm saved to file");
}

/**
 * Parses a JSON string and verifies it contains nodes and edges arrays.
 */
export function parseAndLoad(jsonContent: string): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const parsed = JSON.parse(jsonContent);
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("Invalid format. Missing nodes or edges array.");
  }
  return { nodes: parsed.nodes, edges: parsed.edges };
}
