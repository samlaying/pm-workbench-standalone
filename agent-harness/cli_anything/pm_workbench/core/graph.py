from __future__ import annotations

from typing import Any
from cli_anything.pm_workbench.core.client import WorkbenchClient


def get_project_graph(client: WorkbenchClient) -> dict[str, Any]:
    """Get the full project requirement graph."""
    return client.get_graph()


def list_graph_nodes(
    client: WorkbenchClient, node_type: str | None = None
) -> list[dict[str, Any]]:
    """List nodes in the project requirement graph, optionally filtered by type."""
    graph = client.get_graph()
    nodes = graph.get("nodes", [])
    if node_type:
        target_type = node_type.strip().lower()
        return [n for n in nodes if str(n.get("type", "")).lower() == target_type]
    return nodes


def list_graph_edges(client: WorkbenchClient) -> list[dict[str, Any]]:
    """List all agent links and edges in the requirement graph."""
    graph = client.get_graph()
    return graph.get("edges", [])


def get_graph_node(client: WorkbenchClient, node_id: str) -> dict[str, Any] | None:
    """Get details of a specific requirement graph node by id."""
    nodes = list_graph_nodes(client)
    for n in nodes:
        if str(n.get("id")) == str(node_id):
            return n
    return None
