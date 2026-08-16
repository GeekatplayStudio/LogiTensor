"""Natural-language / source-code -> graph builder backed by the local Ollama LLM.

The frontend sends the user's request plus a compact schema of every node
type (derived from NODE_DEFINITIONS, so this module never duplicates the node
catalog). The model must answer with pure JSON; validation and materialization
happen client-side in src/lib/nl-apply.ts — this endpoint only produces a
*proposal*, never trusted graph state.
"""
import asyncio
import json
from typing import Any, Dict, List

import ollama

# Models that reliably follow this contract, best first. Small general chat
# models (llama3:8b and friends) routinely wire data ports into trigger ports
# and emit null endpoints, which is why the default is no longer llama3.
PREFERRED_MODELS = [
    "qwen2.5-coder:32b",
    "qwen3:30b",
    "gpt-oss:20b",
    "qwen2.5-coder",
    "qwen2.5:7b",
    "llama3.1:8b",
    "llama3",
]

# The two rules the weak models actually get wrong are spelled out explicitly
# and demonstrated, because abstract instructions alone did not stick:
# (1) trigger ports carry execution, data ports carry values — a number goes
#     into `value`, never into `inTrigger`; (2) never emit a null endpoint.
SYSTEM_PROMPT = """You convert requests into a node graph for a visual logic editor.

Respond with ONLY a JSON object, no prose and no markdown fences:
{"nodes":[{"id":"n1","type":"<type from catalog>","config":{...}}],
 "edges":[{"source":"n1","sourceHandle":"<output port id>",
           "target":"n2","targetHandle":"<input port id>"}]}

PORT RULES — these are the rules that are most often broken, follow them exactly:
1. Every port in the catalog is marked (trigger) or (<datatype>).
   A (trigger) OUTPUT may only connect to a (trigger) INPUT. It carries
   "now run this", never a value.
   A data OUTPUT connects to a data INPUT of the same or `any` type.
   NEVER connect a number/string/boolean output into a trigger input such as
   `inTrigger` — put it in the node's data input (usually `value`) instead.
   And NEVER connect `triggerOut` into a data input such as `enabled`, `a`
   or `value`. `enabled` is an ordinary boolean input: leave it unwired
   unless a real boolean output feeds it.
2. Any flow that contains trigger-driven nodes MUST start with a
   `triggerInput` node, wired triggerOut -> that node's trigger input.
3. NEVER emit an edge whose source, sourceHandle, target or targetHandle is
   null, empty or missing. Omit the edge entirely instead.
4. Only use node types and port ids that appear in the catalog. Only use
   config keys shown for that node type.
5. Wire every node you create into the flow. Do not leave nodes unconnected.

WORKED EXAMPLE — request: "log the number 42"
{"nodes":[{"id":"n1","type":"triggerInput","config":{}},
          {"id":"n2","type":"constNum","config":{"value":42}},
          {"id":"n3","type":"loggerNode","config":{}}],
 "edges":[{"source":"n1","sourceHandle":"triggerOut","target":"n3","targetHandle":"inTrigger"},
          {"source":"n2","sourceHandle":"value","target":"n3","targetHandle":"value"}]}
Note the number goes to `value` and the trigger goes to `inTrigger`.
"""

CODE_SYSTEM_PROMPT = SYSTEM_PROMPT + """
The request is existing SOURCE CODE that the user hand-edited. Reproduce its
logic as a node graph: read the control flow and data flow and map them onto
the catalog's node types. Preserve literal values as node config where the
catalog allows it.
"""


def list_models() -> List[str]:
    """Installed Ollama models, preferred/most-capable first."""
    try:
        res = ollama.list()
        names = [m.get("model") or m.get("name") for m in res.get("models", [])]
        names = [n for n in names if n]
    except Exception:
        return []

    def rank(name: str) -> int:
        for i, pref in enumerate(PREFERRED_MODELS):
            if name.startswith(pref):
                return i
        return len(PREFERRED_MODELS)

    # Embedding-only models can't answer this at all.
    names = [n for n in names if "embed" not in n.lower()]
    return sorted(names, key=lambda n: (rank(n), n))


def default_model() -> str:
    models = list_models()
    return models[0] if models else "llama3"


async def build_graph_from_prompt(
    prompt: str, schema: List[Dict[str, Any]], model: str = "", mode: str = "prompt"
) -> Dict[str, Any]:
    chosen = model or default_model()
    catalog = json.dumps(schema, separators=(",", ":"))
    if mode == "code":
        system = CODE_SYSTEM_PROMPT
        full_prompt = f"Node catalog:\n{catalog}\n\nSource code:\n{prompt}\n\nJSON:"
    else:
        system = SYSTEM_PROMPT
        full_prompt = f"Node catalog:\n{catalog}\n\nRequest: {prompt}\n\nJSON:"

    loop = asyncio.get_event_loop()
    # format="json" makes Ollama constrain decoding to valid JSON — the main
    # reason parsing failures are rare even on small local models.
    res = await loop.run_in_executor(
        None,
        lambda: ollama.generate(model=chosen, prompt=full_prompt, system=system, format="json"),
    )
    raw = res.get("response", "")
    try:
        graph = json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": f"Model returned invalid JSON: {e}", "raw": raw[:2000], "model": chosen}
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list):
        return {"error": "Model response is missing a nodes list.", "raw": raw[:2000], "model": chosen}

    # `raw` and `model` are echoed back so the UI's activity log can show
    # exactly what was asked and what came back.
    return {
        "graph": {"nodes": graph.get("nodes", []), "edges": graph.get("edges", [])},
        "model": chosen,
        "raw": raw[:4000],
        "prompt": full_prompt[:4000],
    }
