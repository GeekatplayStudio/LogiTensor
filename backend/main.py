from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Any, Dict
from backend.execution_engine import compile_and_run_graph

app = FastAPI(title="LogiBoard LangGraph Backend")

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

@app.get("/")
def read_root():
    return {"status": "online", "engine": "LangGraph"}
