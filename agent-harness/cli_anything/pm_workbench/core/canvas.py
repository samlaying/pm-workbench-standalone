from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any
from cli_anything.pm_workbench.core.client import WorkbenchClient


def list_cards(client: WorkbenchClient) -> list[dict[str, Any]]:
    state = client.get_state()
    return state.get("cards", [])


def get_card(client: WorkbenchClient, card_id: str) -> dict[str, Any] | None:
    cards = list_cards(client)
    for c in cards:
        if str(c.get("id")) == str(card_id):
            return c
    return None


def add_card(
    client: WorkbenchClient,
    title: str,
    body: str,
    x: int = 90,
    y: int = 80,
    icon: str = "📄",
) -> dict[str, Any]:
    cards = list_cards(client)
    new_id = f"{int(time.time() * 1000)}-{len(cards)}"
    card = {
        "id": new_id,
        "title": title,
        "body": body,
        "icon": icon,
        "x": x,
        "y": y
    }
    updated_cards = [*cards, card]
    client.update_cards(updated_cards)
    return card


def update_card(
    client: WorkbenchClient,
    card_id: str,
    title: str | None = None,
    body: str | None = None,
    x: int | None = None,
    y: int | None = None,
    icon: str | None = None,
) -> dict[str, Any]:
    cards = list_cards(client)
    target = None
    for c in cards:
        if str(c.get("id")) == str(card_id):
            target = c
            break
    if not target:
        raise KeyError(f"Card with id '{card_id}' not found")

    if title is not None:
        target["title"] = title
    if body is not None:
        target["body"] = body
    if x is not None:
        target["x"] = x
    if y is not None:
        target["y"] = y
    if icon is not None:
        target["icon"] = icon

    client.update_cards(cards)
    return target


def delete_card(client: WorkbenchClient, card_id: str) -> bool:
    cards = list_cards(client)
    new_cards = [c for c in cards if str(c.get("id")) != str(card_id)]
    if len(new_cards) == len(cards):
        return False
    client.update_cards(new_cards)
    return True


def export_cards(client: WorkbenchClient, output_file: str | None = None) -> dict[str, Any]:
    cards = list_cards(client)
    payload = {"cards": cards, "total": len(cards), "exportedAt": int(time.time() * 1000)}
    if output_file:
        out_path = Path(output_file).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        payload["outputPath"] = str(out_path)
    return payload
