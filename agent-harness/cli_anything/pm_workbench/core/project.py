from __future__ import annotations

from typing import Any
from cli_anything.pm_workbench.core.client import WorkbenchClient


def bind_project(client: WorkbenchClient, path: str) -> dict[str, Any]:
    return client.bind_project(path)


def get_project_status(client: WorkbenchClient) -> dict[str, Any]:
    state = client.get_state()
    return {
        "projectPath": state.get("projectPath", ""),
        "projects": state.get("projects", []),
        "messageCount": len(state.get("messages", [])),
        "cardCount": len(state.get("cards", [])),
        "serverOnline": client.is_server_available()
    }


def scan_current_project(client: WorkbenchClient) -> dict[str, Any]:
    state = client.get_state()
    curr_path = state.get("projectPath")
    if not curr_path:
        return {"error": "当前未绑定任何项目，请先执行 project bind <path>"}
    return client.bind_project(curr_path)
