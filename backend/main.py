from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Any, Dict
from backend.execution_engine import compile_and_run_graph
from backend.nl_builder import build_graph_from_prompt, list_models, default_model

app = FastAPI(title="LogiTensor LangGraph Backend")

# Enable CORS for Next.js frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LayerData(BaseModel):
    id: str
    name: str
    nodes: List[Any] = []
    edges: List[Any] = []

class WorkflowLayersRequest(BaseModel):
    activeLayerId: str = ""
    layers: List[LayerData] = []
    # Legacy fallbacks
    nodes: List[Any] = []
    edges: List[Any] = []

@app.post("/run")
async def run_graph(payload: WorkflowLayersRequest):
    try:
        if payload.layers:
            # Multi-layer parallel execution: combine all nodes and edges across dimensions
            all_nodes = []
            all_edges = []
            for layer in payload.layers:
                all_nodes.extend(layer.nodes)
                all_edges.extend(layer.edges)
            result = await compile_and_run_graph(all_nodes, all_edges)
        else:
            # Legacy single-layer execution
            result = await compile_and_run_graph(payload.nodes, payload.edges)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class NlBuildRequest(BaseModel):
    prompt: str
    # Compact node-type catalog sent by the frontend (single source of truth
    # is NODE_DEFINITIONS in TypeScript — the backend never duplicates it).
    # Aliased because "schema" shadows a BaseModel attribute in pydantic.
    schema_: List[Dict[str, Any]] = Field(default=[], alias="schema")
    # Empty means "pick the most capable installed model" (see default_model).
    model: str = ""
    # "prompt" = a natural-language request; "code" = hand-edited source the
    # user wants turned back into a graph.
    mode: str = "prompt"


@app.post("/nl-build")
async def nl_build(payload: NlBuildRequest):
    try:
        return await build_graph_from_prompt(payload.prompt, payload.schema_, payload.model, payload.mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/models")
def get_models():
    """Installed Ollama models for the builder's model picker."""
    return {"models": list_models(), "default": default_model()}


@app.get("/")
def read_root():
    return {"status": "online", "engine": "LangGraph"}
