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


def test_new_chat_session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from cli_anything.pm_workbench.core.session import new_chat_session

    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True)
    state = client.load_local_state()
    state["messages"] = [{"role": "user", "text": "hello"}]
    state["cards"] = [{"id": "c1", "title": "Card 1"}]
    state["workflow"] = {"status": "running"}
    client.save_local_state(state)

    res = new_chat_session(client)
    assert res["messages"] == []
    assert res["cards"] == []
    assert res["workflow"] is None
    # Verify that previous session was archived into conversations
    assert len(res["conversations"]) == 1
    assert res["conversations"][0]["title"] == "hello"
    assert len(res["conversations"][0]["cards"]) == 1


def test_conversation_list_and_open(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from cli_anything.pm_workbench.core.session import list_conversations, open_conversation

    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True)
    state = client.load_local_state()
    state["conversations"] = [
        {
            "id": "chat-100",
            "title": "历史对话 1",
            "messages": [{"role": "user", "text": "旧问题"}],
            "cards": [{"id": "c-old", "title": "旧卡片"}],
        }
    ]
    state["messages"] = []
    state["cards"] = []
    client.save_local_state(state)

    convs = list_conversations(client)
    assert len(convs) == 1
    assert convs[0]["id"] == "chat-100"

    opened = open_conversation(client, "chat-100")
    assert opened["currentConversationId"] == "chat-100"
    assert len(opened["messages"]) == 1
    assert opened["messages"][0]["text"] == "旧问题"
    assert len(opened["cards"]) == 1
    assert opened["cards"][0]["title"] == "旧卡片"



def test_analyze_project_proactive_recommendations():
    from cli_anything.pm_workbench.core.client import analyze_project

    project = {
        "items": [
            {"name": "项目上下文.md", "type": "memory"},
            {"name": "会议纪要.md", "type": "meeting"},
            {"name": "prd.md", "type": "document"},
        ]
    }
    analysis = analyze_project(project, "帮我推进这个需求")
    assert len(analysis["recommendations"]) > 0
    assert "project-context-maintainer" in analysis["skills"]
    assert "meeting-notes-organizer" in analysis["skills"]
    assert "task-arrangement-planner" in analysis["skills"]
    assert any("会议纪要" in r for r in analysis["recommendations"])


def test_build_memory_suggestions():
    from cli_anything.pm_workbench.core.client import build_memory_suggestions

    results = [
        {"skill": "meeting-notes-organizer", "text": "会议决定：本周完成上线风险评估"},
        {"skill": "prd-writer", "text": "老板偏好更轻量的前端方案"},
        {"skill": "update-writer", "text": "常规进度同步"},
    ]
    suggestions = build_memory_suggestions(results)
    assert len(suggestions) == 2
    assert suggestions[0]["target"] == "project"
    assert suggestions[0]["requiresConfirmation"] is True
    assert suggestions[1]["target"] == "person"
    assert suggestions[1]["requiresConfirmation"] is True


def test_multi_agent_merge_skill_results():
    from cli_anything.pm_workbench.core.client import merge_skill_results, select_skills

    skills = select_skills("你俩分一下，调研一下不同产品，接入 飞书/企业微信/微信/钉钉 这些渠道的流程和能力差异")
    assert "task-arrangement-planner" in skills
    assert "project-context-maintainer" in skills
    assert "ai-pm-prd-builder" in skills

    results = [
        {"skill": "task-arrangement-planner", "text": "分工与推进计划"},
        {"skill": "project-context-maintainer", "text": "系统上下文与边界记忆"},
        {"skill": "ai-pm-prd-builder", "text": "渠道能力差异矩阵"},
    ]
    merged = merge_skill_results(results)
    assert len(merged["cards"]) == 3
    assert merged["cards"][0]["skillLabel"] == "任务拆解与分工"
    assert merged["cards"][1]["skillLabel"] == "项目背景与决策记忆"
    assert merged["cards"][2]["skillLabel"] == "产品能力与矩阵契约"
    assert merged["cards"][0]["icon"] == "📋"
    assert merged["cards"][1]["icon"] == "🧠"
    assert merged["cards"][2]["icon"] == "🤖"


def test_cross_conversation_project_cards(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from cli_anything.pm_workbench.core.canvas import list_project_cards, import_card

    mock_data_file = tmp_path / "data" / "workspace.json"
    monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_data_file)

    client = WorkbenchClient(force_local=True)
    state = client.load_local_state()
    state["currentConversationId"] = "conv-active"
    state["cards"] = [{"id": "card-now", "title": "当前卡片"}]
    state["conversations"] = [
        {
            "id": "conv-history-1",
            "title": "渠道调研会话",
            "cards": [{"id": "card-hist-1", "title": "飞书接入流程"}],
        }
    ]
    client.save_local_state(state)

    # 1. Test listing all cards across conversations
    all_cards = list_project_cards(client)
    assert len(all_cards) == 2
    hist_card = next(c for c in all_cards if c["id"] == "card-hist-1")
    assert hist_card["sourceConversationTitle"] == "渠道调研会话"

    # 2. Test importing a card from history into active canvas
    res = import_card(client, "card-hist-1")
    assert len(res["cards"]) == 2
    imported = next(c for c in res["cards"] if "card-hist-1" in c["id"])
    assert imported["title"] == "飞书接入流程"
    assert imported["sourceConversationId"] == "conv-active"




