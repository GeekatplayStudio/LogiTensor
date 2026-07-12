import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
} from "@xyflow/react";
import { NodeData, NODE_DEFINITIONS } from "@/types/nodes";
import { computeNodeOutputs, handleTriggerOperation } from "@/lib/execution-helpers";
import { getPortColor } from "@/lib/node-styles";
import { toast } from "sonner";

// Format edge label text previews
const formatEdgeValue = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return "Object";
  const str = String(val);
  return str.length > 15 ? str.substring(0, 12) + "..." : str;
};

export interface Layer {
  id: string;
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface NodeEditorState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  isRunning: boolean;
  stepDelayMs: number;
  setStepDelayMs: (delay: number) => void;
  runLoops: number;
  setRunLoops: (loops: number) => void;
  
  // Layers State
  layers: Layer[];
  activeLayerId: string;
  isLayersViewOpen: boolean;
  addLayer: () => void;
  selectLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  setIsLayersViewOpen: (open: boolean) => void;
  toggleNodeMultiDimensional: (nodeId: string) => void;
  
  // React Flow Handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  disconnectHandle: (nodeId: string, handleId: string, type: "source" | "target") => void;
  
  // Canvas Actions
  addNode: (type: string, x: number, y: number) => void;
  deleteNode: (id: string) => void;
  clearBoard: () => void;
  updateNodeConfig: (id: string, config: Record<string, any>) => void;
  updateNodeInputStaticValue: (nodeId: string, inputId: string, value: any) => void;
  
  // Execution Engine
  evaluateNode: (nodeId: string) => void;
  triggerNode: (nodeId: string, outputPortId: string) => Promise<void>;
  runAll: () => Promise<void>;
  resetExecutionStates: () => void;
  
  // Serialization
  saveToFile: () => void;
  loadFromFile: (jsonContent: string) => void;
}

export const useNodeEditorStore = create<NodeEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  isRunning: false,
  stepDelayMs: 300,
  setStepDelayMs: (delay) => set({ stepDelayMs: delay }),
  runLoops: 1,
  setRunLoops: (loops) => set({ runLoops: loops }),
  
  // Layers state
  layers: [{ id: "layer_default", name: "Dimension Alpha", nodes: [], edges: [] }],
  activeLayerId: "layer_default",
  isLayersViewOpen: false,
  
  addLayer: () => {
    const id = `layer_${Date.now()}`;
    const count = get().layers.length + 1;
    const name = `Dimension ${String.fromCharCode(64 + count)}`; // Dimension B, C, etc.
    const newLayer: Layer = { id, name, nodes: [], edges: [] };
    set((state) => ({ layers: [...state.layers, newLayer] }));
    toast.success(`Created ${name}`);
  },
  
  selectLayer: (id) => {
    const { activeLayerId, nodes, edges, layers } = get();
    if (activeLayerId === id) return;
    
    const updatedLayers = layers.map((l) => {
      if (l.id === activeLayerId) {
        return { ...l, nodes, edges };
      }
      return l;
    });
    
    const target = layers.find((l) => l.id === id);
    if (!target) return;
    
    set({
      layers: updatedLayers,
      activeLayerId: id,
      nodes: target.nodes,
      edges: target.edges,
    });
  },
  
  deleteLayer: (id) => {
    const { activeLayerId, layers } = get();
    if (layers.length <= 1) {
      toast.error("Cannot delete the last remaining dimension!");
      return;
    }
    const filtered = layers.filter((l) => l.id !== id);
    
    if (activeLayerId === id) {
      const first = filtered[0];
      set({
        layers: filtered,
        activeLayerId: first.id,
        nodes: first.nodes,
        edges: first.edges,
      });
    } else {
      set({ layers: filtered });
    }
    toast.success("Dimension collapsed.");
  },
  
  setIsLayersViewOpen: (open) => set({ isLayersViewOpen: open }),
  
  toggleNodeMultiDimensional: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          const config = { ...n.data.config };
          config.isMultiDimensional = !config.isMultiDimensional;
          return {
            ...n,
            data: {
              ...n.data,
              config,
            },
          };
        }
        return n;
      }),
    }));
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<NodeData>[],
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !sourceHandle || !target || !targetHandle) return;

    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return;

    const sourcePort = sourceNode.data.outputs.find((o) => o.id === sourceHandle);
    const targetPort = targetNode.data.inputs.find((i) => i.id === targetHandle);
    if (!sourcePort || !targetPort) return;

    // Guardrail: Socket types must match (trigger to trigger, data to data)
    if (sourcePort.type !== targetPort.type) {
      toast.error(`Cannot connect execution flow to data value. Sockets must match: ${sourcePort.type} to ${targetPort.type}.`);
      return;
    }

    set((state) => {
      // Data inputs can only have at most one connection
      let filteredEdges = state.edges;
      if (targetPort.type === "data") {
        filteredEdges = state.edges.filter(
          (e) => !(e.target === target && e.targetHandle === targetHandle)
        );
      }

      const isTrigger = sourcePort.type === "trigger";
      const edgeColor = isTrigger 
        ? "#f59e0b" 
        : sourcePort.dataType === "number" 
        ? "#10b981" 
        : sourcePort.dataType === "boolean" 
        ? "#14b8a6" 
        : sourcePort.dataType === "string" 
        ? "#a78bfa" 
        : "#3b82f6";

      const connectionWithStyle = {
        ...connection,
        style: {
          stroke: edgeColor,
          strokeWidth: isTrigger ? 2.5 : 2,
        },
        animated: isTrigger,
      };

      const newEdges = addEdge(connectionWithStyle, filteredEdges);

      // Trigger evaluation downstream immediately when connected
      setTimeout(() => {
        get().evaluateNode(target);
      }, 0);

      return { edges: newEdges };
    });
  },

  disconnectHandle: (nodeId, handleId, type) => {
    set((state) => ({
      edges: state.edges.filter((edge) => {
        if (type === "target") {
          return !(edge.target === nodeId && edge.targetHandle === handleId);
        } else {
          return !(edge.source === nodeId && edge.sourceHandle === handleId);
        }
      }),
    }));
  },

  addNode: (type, x, y) => {
    const def = NODE_DEFINITIONS[type];
    if (!def) return;

    const id = `${type}_${Date.now()}`;
    const newNode: Node<NodeData> = {
      id,
      type,
      position: { x, y },
      data: {
        label: def.label,
        type: def.type,
        inputs: def.inputs.map((i) => ({ ...i })),
        outputs: def.outputs.map((o) => ({ ...o })),
        config: def.config ? JSON.parse(JSON.stringify(def.config)) : {},
        executionState: "idle",
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));

    // Trigger initial node evaluation
    setTimeout(() => {
      get().evaluateNode(id);
    }, 0);

    toast.success(`Added ${def.label}`);
  },

  deleteNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    toast.success("Node deleted");
  },

  clearBoard: () => {
    set({ nodes: [], edges: [] });
    toast.success("Board cleared");
  },

  updateNodeConfig: (id, newConfig) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              config: { ...n.data.config, ...newConfig },
            },
          };
        }
        return n;
      }),
    }));

    // Re-evaluate node and its descendants
    setTimeout(() => {
      get().evaluateNode(id);
    }, 0);
  },

  updateNodeInputStaticValue: (nodeId, inputId, value) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          const updatedInputs = n.data.inputs.map((input) => {
            if (input.id === inputId) {
              return { ...input, value };
            }
            return input;
          });
          return {
            ...n,
            data: { ...n.data, inputs: updatedInputs },
          };
        }
        return n;
      }),
    }));

    // Re-evaluate node when a static input changes
    setTimeout(() => {
      get().evaluateNode(nodeId);
    }, 0);
  },

  // Evaluate a node's output data variables reactively
  evaluateNode: (nodeId) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // 1. Resolve inputs from incoming data connections or fall back to static/input values
    const inputs: Record<string, any> = {};
    for (const input of node.data.inputs) {
      if (input.type === "trigger") continue; // Triggers are not evaluated as data

      const incomingEdge = edges.find(
        (e) => e.target === nodeId && e.targetHandle === input.id
      );

      if (incomingEdge) {
        const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
        const sourcePort = sourceNode?.data.outputs.find(
          (o) => o.id === incomingEdge.sourceHandle
        );
        inputs[input.id] = sourcePort ? sourcePort.value : input.value;
      } else {
        inputs[input.id] = input.value;
      }
    }

    // 2. Perform the logic based on the node's type using the modular helpers
    let outputs: Record<string, any> = {};
    let executionState: "idle" | "error" = "idle";
    let errorMessage: string | undefined = undefined;

    try {
      outputs = computeNodeOutputs(node.type || "", inputs, node.data.config || {});
    } catch (err: any) {
      executionState = "error";
      errorMessage = err.message || "Evaluation error";
    }

    // Update state
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          const updatedOutputs = n.data.outputs.map((outPort) => {
            if (outputs[outPort.id] !== undefined) {
              return { ...outPort, value: outputs[outPort.id] };
            }
            return outPort;
          });

          return {
            ...n,
            data: {
              ...n.data,
              outputs: updatedOutputs,
              executionState:
                executionState === "error" ? "error" : n.data.executionState,
              errorMessage,
            },
          };
        }
        return n;
      }),
    }));

    // 3. Propagate to downstream data nodes
    const downstreamEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of downstreamEdges) {
      const sourcePort = node.data.outputs.find((o) => o.id === edge.sourceHandle);
      if (sourcePort && sourcePort.type === "data") {
        get().evaluateNode(edge.target);
      }
    }
  },

  // Propagates trigger commands through trigger connection lines
  triggerNode: async (nodeId, outputPortId) => {
    const { edges, nodes } = get();

    // Find the edge originating from this node's trigger port
    const triggerEdge = edges.find(
      (e) => e.source === nodeId && e.sourceHandle === outputPortId
    );
    if (!triggerEdge) return;

    const targetNodeId = triggerEdge.target;
    const targetPortId = triggerEdge.targetHandle;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return;

    // 1. Indicate the node is processing/running
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === targetNodeId
          ? {
              ...n,
              data: { ...n.data, executionState: "running" as const },
            }
          : n
      ),
    }));

    // Give visual animation a moment
    await new Promise((r) => setTimeout(r, get().stepDelayMs));

    // 2. Refresh inputs on target node
    get().evaluateNode(targetNodeId);

    // Fetch the updated node state
    const currentNodes = get().nodes;
    const currentTargetNode = currentNodes.find((n) => n.id === targetNodeId)!;

    let nextTriggerPort: string | null = null;
    let status: "success" | "error" = "success";
    let errorMsg = "";

    try {
      // Gather current input port values
      const inputs: Record<string, any> = {};
      for (const input of currentTargetNode.data.inputs) {
        const edge = edges.find(
          (e) => e.target === targetNodeId && e.targetHandle === input.id
        );
        if (edge) {
          const sourceNode = currentNodes.find((n) => n.id === edge.source);
          const sourcePort = sourceNode?.data.outputs.find(
            (o) => o.id === edge.sourceHandle
          );
          inputs[input.id] = sourcePort ? sourcePort.value : input.value;
        } else {
          inputs[input.id] = input.value;
        }
      }

      // Handle operations triggered by execution flow using the execution helper
      const triggerRes = await handleTriggerOperation(
        currentTargetNode.type || "",
        inputs,
        currentTargetNode.data.config || {},
        targetPortId || ""
      );
      nextTriggerPort = triggerRes.nextTriggerPort;

      if (triggerRes.updatedConfig) {
        set((state) => ({
          nodes: state.nodes.map((n) => {
            if (n.id === targetNodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  config: triggerRes.updatedConfig,
                },
              };
            }
            return n;
          }),
        }));
      }

      if (currentTargetNode.type === "counterNode") {
        get().evaluateNode(targetNodeId);
      }
    } catch (err: any) {
      status = "error";
      errorMsg = err.message || "Execution flow error";
    }

    // 3. Mark execution status
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === targetNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                executionState: status,
                errorMessage: errorMsg || undefined,
                lastExecuted: new Date().toISOString(),
              },
            }
          : n
      ),
    }));

    // Trigger downstream evaluations
    get().evaluateNode(targetNodeId);

    // Call next trigger node in sequence if valid
    if (nextTriggerPort && status === "success") {
      await get().triggerNode(targetNodeId, nextTriggerPort);
    }
  },

  runAll: async () => {
    if (get().isRunning) return;
    set({ isRunning: true });
    
    const { runLoops, stepDelayMs } = get();
    const loopsCount = runLoops || 1;
    
    const toastId = toast.loading(`Starting execution loop (0/${loopsCount})...`);
    get().resetExecutionStates();

    try {
      for (let i = 0; i < loopsCount; i++) {
        if (loopsCount > 1) {
          toast.loading(`Executing loop (${i + 1}/${loopsCount})...`, { id: toastId });
        }
        
        // Save current canvas layout to layers slot before compiling
        const { activeLayerId, nodes, edges, layers } = get();
        const currentLayers = layers.map((l) => {
          if (l.id === activeLayerId) {
            return { ...l, nodes, edges };
          }
          return l;
        });

        const response = await fetch("http://localhost:8000/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activeLayerId,
            layers: currentLayers,
          }),
        });

        if (!response.ok) {
          let errorDetail = response.statusText;
          try {
            const errJson = await response.json();
            if (errJson && errJson.detail) {
              errorDetail = errJson.detail;
            }
          } catch {
            // ignore parsing error
          }
          throw new Error(`FastAPI Server error: ${errorDetail}`);
        }

        const res = await response.json();
        console.log("[Execution Result]", res);

        if (res.success) {
          // Update outputs and inputs across ALL dimension slots
          set((state) => {
            const updateLayerNodes = (layerNodes: Node<NodeData>[]) => {
              return layerNodes.map((n) => {
                const nodeOutputs = res.outputs[n.id];
                let updatedOutputs = n.data.outputs;
                if (nodeOutputs) {
                  updatedOutputs = n.data.outputs.map((outPort) => {
                    if (nodeOutputs[outPort.id] !== undefined) {
                      return { ...outPort, value: nodeOutputs[outPort.id] };
                    }
                    return outPort;
                  });
                }

                const updatedConfig = { ...n.data.config };
                if (n.type === "loggerNode" && nodeOutputs && nodeOutputs.logs) {
                  updatedConfig.logs = nodeOutputs.logs;
                }
                if (n.type === "counterNode" && nodeOutputs && nodeOutputs.count !== undefined) {
                  updatedConfig.count = nodeOutputs.count;
                }

                return {
                  ...n,
                  data: {
                    ...n.data,
                    outputs: updatedOutputs,
                    config: updatedConfig,
                    executionState: nodeOutputs ? ("success" as const) : n.data.executionState,
                    errorMessage: undefined,
                    lastExecuted: nodeOutputs ? new Date().toISOString() : n.data.lastExecuted,
                  },
                };
              });
            };

            const updateLayerEdges = (layerEdges: Edge[], layerNodes: Node<NodeData>[]) => {
              return layerEdges.map((edge) => {
                const sourceNode = layerNodes.find((ln) => ln.id === edge.source);
                if (!sourceNode || sourceNode.data.executionState !== "success") {
                  return {
                    ...edge,
                    label: undefined,
                    style: {
                      ...edge.style,
                      strokeWidth: 2,
                      opacity: 0.25,
                    },
                  };
                }

                const isTrigger = edge.sourceHandle?.endsWith("Trigger") || 
                                  edge.sourceHandle === "triggerOut" || 
                                  edge.sourceHandle === "outTrigger" || 
                                  edge.sourceHandle === "onTrue" || 
                                  edge.sourceHandle === "onFalse";

                if (isTrigger) {
                  return {
                    ...edge,
                    animated: true,
                    style: {
                      stroke: "#f59e0b",
                      strokeWidth: 3,
                      opacity: 1.0,
                    },
                  };
                }

                const outPort = sourceNode.data.outputs.find((o) => o.id === edge.sourceHandle);
                const val = outPort?.value;
                const portColor = getPortColor("data", outPort?.dataType);

                return {
                  ...edge,
                  label: val !== undefined ? formatEdgeValue(val) : undefined,
                  labelBgStyle: { fill: "#18181b", stroke: "#27272a", fillOpacity: 0.95, rx: 4 },
                  labelStyle: { fill: portColor, fontSize: 9, fontFamily: "Outfit", fontWeight: "bold" },
                  style: {
                    stroke: portColor,
                    strokeWidth: 3,
                    opacity: 1.0,
                  },
                };
              });
            };

            const updateLayerInputs = (layerNodes: Node<NodeData>[], layerEdges: Edge[]) => {
              return layerNodes.map((n) => {
                const updatedInputs = n.data.inputs.map((inPort) => {
                  if (inPort.type === "trigger") return inPort;
                  const incoming = layerEdges.find((e) => e.target === n.id && e.targetHandle === inPort.id);
                  if (incoming && incoming.sourceHandle) {
                    // Direct backend output lookup fallback
                    const directVal = res.outputs[incoming.source]?.[incoming.sourceHandle];
                    if (directVal !== undefined) {
                      return { ...inPort, value: directVal };
                    }

                    const srcNode = layerNodes.find((sn) => sn.id === incoming.source);
                    if (srcNode) {
                      const srcOut = srcNode.data.outputs.find((o) => o.id === incoming.sourceHandle);
                      if (srcOut && srcOut.value !== undefined) {
                        return { ...inPort, value: srcOut.value };
                      }
                    }
                  }
                  return inPort;
                });

                return {
                  ...n,
                  data: {
                    ...n.data,
                    inputs: updatedInputs,
                  },
                };
              });
            };

            // 1. Process active nodes
            const updatedActiveNodesOutputs = updateLayerNodes(state.nodes);
            const updatedActiveEdges = updateLayerEdges(state.edges, updatedActiveNodesOutputs);
            const updatedActiveNodes = updateLayerInputs(updatedActiveNodesOutputs, updatedActiveEdges);

            // 2. Process all dimensions
            const updatedLayers = state.layers.map((layer) => {
              if (layer.id === state.activeLayerId) {
                return { ...layer, nodes: updatedActiveNodes, edges: updatedActiveEdges };
              }
              const layerNodesOutputs = updateLayerNodes(layer.nodes);
              const layerEdges = updateLayerEdges(layer.edges, layerNodesOutputs);
              const layerNodes = updateLayerInputs(layerNodesOutputs, layerEdges);
              return { ...layer, nodes: layerNodes, edges: layerEdges };
            });

            return {
              nodes: updatedActiveNodes,
              edges: updatedActiveEdges,
              layers: updatedLayers,
            };
          });
        } else {
          throw new Error(res.error || "Compilation failed");
        }

        // Sleep between loops if loopsCount > 1
        if (i < loopsCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(100, stepDelayMs)));
        }
      }

      toast.dismiss(toastId);
      toast.success(loopsCount > 1 ? `Completed ${loopsCount} loops successfully!` : "LangGraph execution completed successfully!");
      console.log("=== LangGraph Execution Completed ===");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`LangGraph run failed: ${err.message}. Make sure Python FastAPI is running on port 8000.`);
      
      // Update execution state to error for all nodes
      set((state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            executionState: "error" as const,
            errorMessage: err.message,
          },
        })),
      }));
    } finally {
      set({ isRunning: false });
    }
  },

  resetExecutionStates: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionState: "idle",
          errorMessage: undefined,
          // If it is a logger, we can clear the logs or preserve them. Let's preserve but reset status.
        },
      })),
    }));
  },

  saveToFile: () => {
    const { activeLayerId, nodes, edges, layers } = get();
    const currentLayers = layers.map((l) => {
      if (l.id === activeLayerId) {
        return { ...l, nodes, edges };
      }
      return l;
    });

    const filePayload = JSON.stringify({
      activeLayerId,
      layers: currentLayers
    }, null, 2);

    const blob = new Blob([filePayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logiboard_layers_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("All dimensions saved successfully");
  },

  loadFromFile: (jsonContent) => {
    try {
      const data = JSON.parse(jsonContent);
      if (data.layers && Array.isArray(data.layers)) {
        const active = data.activeLayerId || data.layers[0]?.id;
        const activeLayer = data.layers.find((l: any) => l.id === active) || data.layers[0];
        
        set({
          layers: data.layers,
          activeLayerId: active,
          nodes: activeLayer?.nodes || [],
          edges: activeLayer?.edges || []
        });
      } else {
        // Fallback loading format (legacy single layer)
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        set({
          layers: [{ id: "layer_default", name: "Dimension Alpha", nodes, edges }],
          activeLayerId: "layer_default",
          nodes,
          edges
        });
      }

      setTimeout(() => {
        const currentNodes = get().nodes;
        for (const n of currentNodes) {
          get().evaluateNode(n.id);
        }
      }, 50);
      toast.success("Algorithm loaded successfully");
    } catch (err: any) {
      toast.error(`Failed to load algorithm: ${err.message}`);
    }
  },
}));
