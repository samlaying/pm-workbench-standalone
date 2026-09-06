from __future__ import annotations

import json
import tempfile
from pathlib import Path
import pytest

from cli_anything.pm_workbench.core.client import (
    WorkbenchClient,
    parse_credential_refs,
    resolve_model_config,
    scan_project,
)
from cli_anything.pm_workbench.core.canvas import (
    add_card,
    delete_card,
    export_cards,
    get_card,
    list_cards,
    update_card,
)
from cli_anything.pm_workbench.core.project import (
    bind_project,
    get_project_status,
)
from cli_anything.pm_workbench.core.session import (
    clear_chat_history,
    get_chat_history,
    send_chat_message,
)


def test_parse_credential_refs():
    yaml_text = "refs:\n  CLIPROXY_API_KEY: 'test-secret-123'\n  OTHER_KEY: normal_val\n"
    refs = parse_credential_refs(yaml_text)
    assert refs.get("CLIPROXY_API_KEY") == "test-secret-123"
    assert refs.get("OTHER_KEY") == "normal_val"


def test_scan_project(tmp_path: Path):
    # Create structure:
    # tmp/
    #   doc1.md
    #   sub/
    #     doc2.txt
    #     ignored.png
    #     nested/
    #       deep.xml
    #       too_deep/
    #         invisible.md
    (tmp_path / "doc1.md").write_text("# Doc 1")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "doc2.txt").write_text("Text doc")
    (sub / "ignored.png").write_bytes(b"\x89PNG")
    nested = sub / "nested"
    nested.mkdir()
    (nested / "deep.xml").write_text("<xml/>")
    too_deep = nested / "too_deep"
    too_deep.mkdir()
    (too_deep / "invisible.md").write_text("Should be skipped by depth > 2")

    result = scan_project(str(tmp_path))
    assert result["name"] == tmp_path.name
    names = [x["name"] for x in result["items"]]
    assert "doc1.md" in names
    assert "doc2.txt" in names
    assert "deep.xml" in names
    assert "ignored.png" not in names
    assert "invisible.md" not in names


def test_client_local_state_and_cards(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    mock_data_file = data_dir / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True)
    state = client.get_state()
    assert state["cards"] == []
    assert state["messages"] == []

    # Add card
    card = add_card(client, title="测试卡片", body="### 详情内容", x=100, y=120, icon="🚀")
    assert card["title"] == "测试卡片"
    assert card["icon"] == "🚀"

    # List cards
    cards = list_cards(client)
    assert len(cards) == 1
    assert cards[0]["id"] == card["id"]

    # Get card
    fetched = get_card(client, card["id"])
    assert fetched is not None
    assert fetched["title"] == "测试卡片"

    # Update card
    updated = update_card(client, card["id"], title="已修改卡片", x=200)
    assert updated["title"] == "已修改卡片"
    assert updated["x"] == 200

    # Export cards
    export_target = tmp_path / "export.json"
    exported = export_cards(client, output_file=str(export_target))
    assert exported["total"] == 1
    assert export_target.exists()

    # Delete card
    deleted = delete_card(client, card["id"])
    assert deleted is True
    assert len(list_cards(client)) == 0


def test_client_chat_and_project_binding(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.resolve_model_config", lambda: {
        "baseUrl": "",
        "model": "gpt-5.5",
        "apiKey": ""
    })

    client = WorkbenchClient(force_local=True)

    # Bind project
    proj_dir = tmp_path / "sample-project"
    proj_dir.mkdir()
    (proj_dir / "spec.md").write_text("Specifications")
    bind_res = bind_project(client, str(proj_dir))
    assert bind_res["projectPath"] == str(proj_dir.resolve())

    status = get_project_status(client)
    assert status["projectPath"] == str(proj_dir.resolve())
    assert status["serverOnline"] is False

    # Send chat in offline mock
    reply = send_chat_message(client, "生成功能规格需求")
    assert "已收到" in reply["text"] or "离线" in reply["text"]

    msgs = get_chat_history(client)
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"

    # Clear chat
    clear_chat_history(client)
    assert len(get_chat_history(client)) == 0


def test_client_chat_mocked_model_reply(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.resolve_model_config", lambda: {
        "baseUrl": "http://mock-model/v1",
        "model": "gpt-5.5",
        "apiKey": "mock-key"
    })

    class MockResponse:
        status_code = 200
        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": '```json\n{"text":"已完成方案提炼","cards":[{"title":"产出卡片","body":"正文"}]}\n```'
                    }
                }]
            }

    monkeypatch.setattr("requests.post", lambda *args, **kwargs: MockResponse())

    client = WorkbenchClient(force_local=True)
    reply = send_chat_message(client, "请产出方案卡片")
    assert reply["text"] == "已完成方案提炼"
    assert len(reply["cards"]) == 1
    assert reply["cards"][0]["title"] == "产出卡片"



def test_dry_run_does_not_mutate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True, dry_run=True)
    add_card(client, title="不会保存", body="Body")
    assert not mock_data_file.exists()


def test_file_classification_and_skill_selection():
    from cli_anything.pm_workbench.core.client import classify_file, select_skills

    assert classify_file("会议纪要/2026-09-01.md")["type"] == "meeting"
    assert classify_file("数据表.xlsx")["type"] == "table"
    assert classify_file("架构图.mmd")["type"] == "flow"
    assert classify_file("普通文档.md")["type"] == "document"

    skills = select_skills("基于会议纪要写 PRD 并准备汇报")
    assert "meeting-notes-organizer" in skills
    assert "prd-writer" in skills
    assert "update-writer" in skills


def test_workflow_answer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True)
    res = client.answer_workflow("deep")
    assert res["workflow"]["status"] == "approved"
    assert res["workflow"]["answer"] == "deep"

