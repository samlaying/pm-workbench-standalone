from __future__ import annotations

from typing import Any
from cli_anything.pm_workbench.core.client import WorkbenchClient


def send_chat_message(client: WorkbenchClient, text: str) -> dict[str, Any]:
    return client.send_message(text)


def get_chat_history(client: WorkbenchClient, limit: int | None = None) -> list[dict[str, Any]]:
    state = client.get_state()
    messages = state.get("messages", [])
    if limit and limit > 0:
        return messages[-limit:]
    return messages


def clear_chat_history(client: WorkbenchClient) -> dict[str, Any]:
    state = client.load_local_state()
    state["messages"] = []
    client.save_local_state(state)
    return {"status": "cleared", "messages": []}


def new_chat_session(client: WorkbenchClient) -> dict[str, Any]:
    return client.new_chat()


def list_conversations(client: WorkbenchClient) -> list[dict[str, Any]]:
    return client.list_conversations()


def open_conversation(client: WorkbenchClient, conversation_id: str) -> dict[str, Any]:
    return client.open_conversation(conversation_id)

