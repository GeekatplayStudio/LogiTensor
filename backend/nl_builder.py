"""Natural-language -> graph builder backed by the local Ollama LLM.

The frontend sends the user's sentence plus a compact schema of every node
type (derived from NODE_DEFINITIONS, so this module never duplicates the node
catalog). The model must answer with pure JSON; validation and materialization
happen client-side in src/lib/nl-apply.ts — this endpoint only produces a
*proposal*, never trusted graph state.
"""
import asyncio
import json
from typing import Any, Dict, List

import ollama

SYSTEM_PROMPT = """You are a logic-flow compiler for a visual node editor.
Given a request, respond with ONLY a JSON object (no prose, no markdown):
{"nodes": [{"id": "n1", "type": "<type from the catalog>", "config": {...}}],
 "edges": [{"source": "n1", "sourceHandle": "<output id>",
            "target": "n2", "targetHandle": "<input id>"}]}
Rules:
- Use ONLY node types and port ids from the provided catalog.
- Wire trigger outputs to trigger inputs. Data outputs go to data inputs
  (boolean/number data may also feed a trigger input).
- Prefer a Manual Trigger (triggerInput) as the entry point of any flow that
  contains trigger-driven nodes.
- Keep config keys limited to the ones shown for that node type.
"""


async def build_graph_from_prompt(prompt: str, schema: List[Dict[str, Any]], model: str) -> Dict[str, Any]:
    catalog = json.dumps(schema, separators=(",", ":"))
    full_prompt = f"Node catalog:\n{catalog}\n\nRequest: {prompt}\n\nJSON:"
    loop = asyncio.get_event_loop()
    # format="json" makes Ollama constrain decoding to valid JSON — the main
    # reason parsing failures are rare even on small local models.
    res = await loop.run_in_executor(
        None,
        lambda: ollama.generate(model=model, prompt=full_prompt, system=SYSTEM_PROMPT, format="json"),
    )
    raw = res.get("response", "")
    try:
        graph = json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": f"Model returned invalid JSON: {e}", "raw": raw[:2000]}
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list):
        return {"error": "Model response is missing a nodes list.", "raw": raw[:2000]}
    return {"graph": {"nodes": graph.get("nodes", []), "edges": graph.get("edges", [])}}
