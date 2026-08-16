import { Edge, Node } from "@xyflow/react";
import { NodeData } from "@/types/nodes";
import { edgeValueLabel, idleEdgeStyle, litEdgeStyle } from "@/lib/edge-styles";
import { getPortColor } from "@/lib/node-styles";

// Pure per-layer helpers extracted from runAll's backend-result application.
// `resOutputs` is the backend response's `outputs` map (node id -> port values).

export const updateLayerNodes = (
  layerNodes: Node<NodeData>[],
  resOutputs: Record<string, Record<string, any>>
) => {
  return layerNodes.map((n) => {
    const nodeOutputs = resOutputs[n.id];
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

export const updateLayerEdges = (layerEdges: Edge[], layerNodes: Node<NodeData>[]) => {
  return layerEdges.map((edge) => {
    const sourceNode = layerNodes.find((ln) => ln.id === edge.source);
    if (!sourceNode || sourceNode.data.executionState !== "success") {
      return {
        ...edge,
        animated: false,
        label: undefined,
        style: idleEdgeStyle(2),
      };
    }

    const isTrigger = edge.sourceHandle?.endsWith("Trigger") ||
                      edge.sourceHandle === "triggerOut" ||
                      edge.sourceHandle === "outTrigger" ||
                      edge.sourceHandle === "onTrue" ||
                      edge.sourceHandle === "onFalse" ||
                      edge.sourceHandle === "spike";

    if (isTrigger) {
      return {
        ...edge,
        animated: true,
        style: litEdgeStyle(getPortColor("trigger"), 3),
      };
    }

    const outPort = sourceNode.data.outputs.find((o) => o.id === edge.sourceHandle);
    const val = outPort?.value;
    const portColor = getPortColor("data", outPort?.dataType);

    return {
      ...edge,
      ...edgeValueLabel(val, portColor),
      style: litEdgeStyle(portColor, 3),
    };
  });
};

export const updateLayerInputs = (
  layerNodes: Node<NodeData>[],
  layerEdges: Edge[],
  resOutputs: Record<string, Record<string, any>>
) => {
  return layerNodes.map((n) => {
    const updatedInputs = n.data.inputs.map((inPort) => {
      if (inPort.type === "trigger") return inPort;
      const incoming = layerEdges.find((e) => e.target === n.id && e.targetHandle === inPort.id);
      if (incoming && incoming.sourceHandle) {
        // Direct backend output lookup fallback
        const directVal = resOutputs[incoming.source]?.[incoming.sourceHandle];
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
