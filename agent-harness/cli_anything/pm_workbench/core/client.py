from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

import requests

DEFAULT_URL = os.environ.get("PM_WORKBENCH_URL", "http://127.0.0.1:4317")


def get_repo_root() -> Path:
    env_root = os.environ.get("PM_WORKBENCH_ROOT")
    if env_root:
        return Path(env_root).resolve()
    # By default, agent-harness/cli_anything/pm_workbench/core/client.py -> repo root is 4 levels up
    current = Path(__file__).resolve().parent
    # Check if we are inside pm-workbench-standalone/agent-harness
    candidate = current.parents[3]
    if (candidate / "server.mjs").exists() or (candidate / "package.json").exists():
        return candidate
    # Fallback to current working directory or /Users/sam/03-Code/02-Own/pm-workbench-standalone
    fallback = Path("/Users/sam/03-Code/02-Own/pm-workbench-standalone")
    if fallback.exists():
        return fallback
    return Path.cwd()


def get_data_file() -> Path:
    return get_repo_root() / "data" / "workspace.json"


def classify_file(file_path: str) -> dict[str, str]:
    name = str(file_path).lower()
    if re.search(r"会议|meeting|日会|周会", name):
        return {"type": "meeting", "label": "会议纪要"}
    if re.search(r"\.xlsx?$|\.csv$", name):
        return {"type": "table", "label": "表格"}
    if re.search(r"\.mmd$|\.mermaid$|流程图|flow", name):
        return {"type": "flow", "label": "流程图"}
    if re.search(r"人物|person|客户|老板", name):
        return {"type": "person", "label": "人物"}
    if re.search(r"任务|todo|task", name):
        return {"type": "task", "label": "任务"}
    if re.search(r"图片|截图|\.png$|\.jpe?g$|\.webp$", name):
        return {"type": "image", "label": "图片"}
    if re.search(r"术语|上下文|工作记录|memory|记忆", name):
        return {"type": "memory", "label": "项目记忆"}
    return {"type": "document", "label": "文档"}


def select_skills(text: str) -> list[str]:
    skills = []
    if re.search(r"会议|纪要|录音|todo|行动项", text):
        skills.append("meeting-notes-organizer")
    if re.search(r"prd|需求文档|评审前|写需求", text, re.IGNORECASE):
        skills.append("prd-writer")
    if re.search(r"评审|反馈|验收标准", text):
        skills.append("prd-review-handler")
    if re.search(r"任务|推进|拆解|安排|领导|分一下|分工|调研|对齐|工作节奏", text):
        skills.append("task-arrangement-planner")
    if re.search(r"汇报|通知|周报|同步|风险", text):
        skills.append("update-writer")
    if re.search(r"复盘|沟通表现", text):
        skills.append("meeting-coach")
    if re.search(r"ai|agent|大模型", text, re.IGNORECASE):
        skills.append("ai-pm-prd-builder")
    return list(dict.fromkeys(skills if skills else ["project-context-maintainer"]))


def analyze_project(project: dict[str, Any] | None, request: str = "") -> dict[str, Any]:
    items = (project or {}).get("items", [])
    skills = select_skills(request)
    if any(item.get("type") == "memory" or re.search(r"上下文|术语|工作记录", item.get("name", "")) for item in items):
        skills.insert(0, "project-context-maintainer")
    if any(item.get("type") == "meeting" for item in items):
        skills.append("meeting-notes-organizer")
    unique_skills = list(dict.fromkeys(skills))
    recommendations = []
    if any(item.get("type") == "meeting" for item in items):
        recommendations.append("建议先整理近期会议纪要，提取决策和行动项")
    if any(item.get("type") == "memory" for item in items):
        recommendations.append("发现项目记忆文件，建议同步最新背景和风险")
    if re.search(r"推进|开始|继续|需求", request):
        recommendations.append("建议并行分析需求、任务推进和相关方沟通")
    return {"skills": unique_skills, "recommendations": recommendations, "files": len(items)}


def build_memory_suggestions(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    suggestions = []
    for r in results:
        text = r.get("text", "")
        if re.search(r"决定|风险|偏好|承诺|行动", text):
            target = "person" if re.search(r"人物|老板|客户", text) else "project"
            suggestions.append({
                "target": target,
                "sourceSkill": r.get("skill", "agent"),
                "content": text,
                "requiresConfirmation": True,
            })
    return suggestions



def scan_project(path_str: str) -> dict[str, Any]:
    target_path = Path(path_str).resolve()
    items = []

    def walk(current_dir: Path, depth: int = 0):
        if depth > 2 or not current_dir.is_dir():
            return
        try:
            for entry in sorted(current_dir.iterdir(), key=lambda p: p.name):
                if entry.name.startswith("."):
                    continue
                if entry.is_dir():
                    walk(entry, depth + 1)
                elif entry.suffix.lower() in [".md", ".txt", ".xml", ".csv", ".mmd", ".mermaid"]:
                    full_str = str(entry.resolve())
                    classified = classify_file(full_str)
                    items.append({
                        "id": full_str,
                        "name": entry.name,
                        "path": full_str,
                        **classified
                    })
        except Exception:
            pass

    if target_path.exists():
        walk(target_path)

    base_name = target_path.name or str(target_path)
    fallback = [
        {"id": "docs", "name": "文档", "type": "group"},
        {"id": "meetings", "name": "会议", "type": "group"},
        {"id": "notes", "name": "工作记录", "type": "group"},
    ]
    return {
        "id": base_name,
        "name": base_name,
        "path": str(target_path),
        "items": items if items else fallback,
    }



def parse_credential_refs(text: str) -> dict[str, str]:
    refs = {}
    for line in text.splitlines():
        match = re.match(r"^\s{2}([A-Z][A-Z0-9_]*):\s*(.*)$", line)
        if match:
            refs[match.group(1)] = match.group(2).strip().strip("'\"")
    return refs


def resolve_model_config() -> dict[str, str]:
    base_url = os.environ.get("MODEL_BASE_URL", "http://192.227.138.214:8317/v1")
    model = os.environ.get("MODEL_NAME", "gpt-5.5")
    api_key = os.environ.get("MODEL_API_KEY") or os.environ.get("CLIPROXY_API_KEY")

    if not api_key:
        cred_file = Path.home() / ".dsh" / ".credentials.yaml"
        if cred_file.exists():
            try:
                refs = parse_credential_refs(cred_file.read_text("utf-8"))
                api_key = refs.get("CLIPROXY_API_KEY")
            except Exception:
                pass

    return {
        "baseUrl": base_url,
        "model": model,
        "apiKey": api_key or ""
    }


def load_project_context(project_path: str, max_chars_per_file: int = 8000) -> str:
    if not project_path:
        return ""
    p = Path(project_path)
    if not p.is_dir():
        return ""
    core_files = ["项目上下文.md", "内部术语表.md", "项目工作记录.md", "任务.md", "猎聘agent-prd.md", "技术细节.md"]
    sections = []
    for fname in core_files:
        fpath = p / fname
        if fpath.is_file():
            try:
                content = fpath.read_text("utf-8")
                if content.strip():
                    sections.append(f"### 【{fname}】\n{content[:max_chars_per_file]}")
            except Exception:
                pass
    return "\n\n".join(sections)


class WorkbenchClient:
    """Client for interacting with PM Workbench via HTTP or Local Storage fallback."""

    def __init__(self, base_url: str = DEFAULT_URL, dry_run: bool = False, force_local: bool = False):
        self.base_url = base_url.rstrip("/")
        self.dry_run = dry_run
        self.force_local = force_local
        self._server_available: bool | None = None

    def is_server_available(self) -> bool:
        if self.force_local:
            return False
        if self._server_available is not None:
            return self._server_available
        try:
            resp = requests.get(f"{self.base_url}/api/state", timeout=0.6)
            self._server_available = resp.status_code == 200
        except Exception:
            self._server_available = False
        return self._server_available

    def load_local_state(self) -> dict[str, Any]:
        data_file = get_data_file()
        if data_file.exists():
            try:
                return json.loads(data_file.read_text("utf-8"))
            except Exception:
                pass
        return {"projectPath": "", "projects": [], "messages": [], "cards": []}

    def save_local_state(self, state: dict[str, Any]) -> None:
        if self.dry_run:
            return
        data_file = get_data_file()
        data_file.parent.mkdir(parents=True, exist_ok=True)
        data_file.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def get_state(self) -> dict[str, Any]:
        if self.is_server_available():
            try:
                resp = requests.get(f"{self.base_url}/api/state", timeout=2.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        return self.load_local_state()

    def bind_project(self, path_str: str) -> dict[str, Any]:
        resolved_path = str(Path(path_str).resolve()) if path_str else ""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(f"{self.base_url}/api/bind", json={"path": resolved_path}, timeout=5.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass

        state = self.load_local_state()
        state["projectPath"] = resolved_path
        state["projects"] = [scan_project(resolved_path)] if resolved_path else []
        self.save_local_state(state)
        return state

    def update_cards(self, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(f"{self.base_url}/api/cards", json={"cards": cards}, timeout=5.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass

        state = self.load_local_state()
        state["cards"] = cards
        self.save_local_state(state)
        return state["cards"]

    def answer_workflow(self, answer: str = "draft") -> dict[str, Any]:
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(f"{self.base_url}/api/workflow/answer", json={"answer": answer}, timeout=120.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        workflow = state.get("workflow") or {}
        workflow["status"] = "approved"
        workflow["answer"] = answer
        state["workflow"] = workflow
        self.save_local_state(state)
        return {"workflow": workflow, "cards": state.get("cards", [])}

    def list_conversations(self) -> list[dict[str, Any]]:
        state = self.get_state()
        return state.get("conversations", [])

    def open_conversation(self, conversation_id: str) -> dict[str, Any]:
        """Switch to a specific conversation, restoring its messages and canvas cards."""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(f"{self.base_url}/api/chat/open", json={"id": conversation_id}, timeout=10.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        conversations = state.get("conversations", [])
        target = next((c for c in conversations if c.get("id") == conversation_id), None)
        if not target:
            raise ValueError(f"对话不存在：{conversation_id}")
        state["messages"] = list(target.get("messages", []))
        state["cards"] = list(target.get("cards", []))
        state["currentConversationId"] = target.get("id")
        self.save_local_state(state)
        return state

    def new_chat(self) -> dict[str, Any]:
        """Start a new chat session by archiving current messages/canvas and resetting state."""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(f"{self.base_url}/api/chat/new", timeout=10.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        messages = state.get("messages", [])
        cards = state.get("cards", [])
        if messages or cards:
            first_user_msg = next((m.get("text", "") for m in messages if m.get("role") == "user"), "新对话")
            title = first_user_msg[:32] if first_user_msg else "新对话"
            now_ms = int(time.time() * 1000)
            conv_id = f"chat-{now_ms}-{os.urandom(3).hex()}"
            saved_conv = {
                "id": conv_id,
                "title": title,
                "messages": list(messages),
                "cards": list(cards),
                "createdAt": now_ms,
                "updatedAt": now_ms,
            }
            conversations = state.get("conversations", [])
            state["conversations"] = [*conversations, saved_conv]
        state["messages"] = []
        state["cards"] = []
        state["workflow"] = None
        state["currentConversationId"] = f"main-{int(time.time() * 1000)}"
        self.save_local_state(state)
        return state

    def send_message(self, text: str, auto_answer: str = "draft") -> dict[str, Any]:
        """Send message and receive response and generated cards."""
        text = text.strip()
        if not text:
            raise ValueError("Message cannot be empty")

        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(
                    f"{self.base_url}/api/message",
                    json={"text": text},
                    stream=True,
                    timeout=60.0
                )
                if resp.status_code == 200:
                    reply_text = ""
                    cards = []
                    question = None
                    analysis = None
                    for line in resp.iter_lines(decode_unicode=True):
                        if not line or not line.startswith("data: "):
                            continue
                        event_data = line[6:].strip()
                        try:
                            parsed = json.loads(event_data)
                            if parsed.get("type") == "text":
                                reply_text += parsed.get("text", "")
                            elif parsed.get("type") == "cards":
                                cards = parsed.get("cards", [])
                            elif parsed.get("type") == "question":
                                question = parsed.get("question")
                                if "analysis" in parsed:
                                    analysis = parsed.get("analysis")
                            elif parsed.get("type") == "error":
                                raise RuntimeError(parsed.get("message", "Unknown error"))
                        except json.JSONDecodeError:
                            continue

                    # If server paused on question, auto-answer with specified choice
                    if question and not reply_text:
                        ans_res = self.answer_workflow(auto_answer)
                        wf = ans_res.get("workflow", {})
                        reply_text = ans_res.get("text") or wf.get("document", "") or f"已确认范围并执行：{text}"
                        cards = ans_res.get("cards", cards)
                        return {
                            "text": reply_text,
                            "cards": cards,
                            "workflow": wf,
                            "question": question,
                            "analysis": analysis,
                            "memorySuggestions": wf.get("memorySuggestions", [])
                        }

                    return {"text": reply_text, "cards": cards, "analysis": analysis}
            except Exception as e:
                # If server call fails, fallback to local
                pass


        # Local execution fallback
        state = self.load_local_state()
        state["messages"].append({"role": "user", "text": text, "at": int(time.time() * 1000)})

        project = state.get("projects", [{}])[0] if state.get("projects") else None
        analysis = analyze_project(project, text)

        config = resolve_model_config()
        reply_text = ""
        new_cards = []
        memory_suggestions = []

        if not config["apiKey"] or not config["baseUrl"]:
            reply_text = f"已收到：{text}\n\n（离线模式）：我会结合当前项目资料继续处理。"
        else:
            project_context = load_project_context(state.get("projectPath", ""))
            system_prompt = (
                '你是 PM Workbench 主 Agent。你必须严格基于下方提供的【当前项目真实资料库】中的背景、业务术语、历史决策和实际文档内容来分析和回答用户，务必引用真实业务事实与文档中的专有名词，严禁脱离实际材料凭空编造。\n'
                '返回严格 JSON：{"text":"给用户的简洁回复","cards":[{"title":"标题","body":"完整 Markdown","icon":"📄","x":90,"y":80}]}。'
                '只有当用户请求产出 PRD、会议纪要、方案、任务画像或其他结构化成果时才新增 cards；'
                '当用户使用 @引用画板卡片并要求修改时，返回同 id 的更新卡片；text 只放摘要。\n\n'
                f'【当前项目真实资料库】：\n{project_context or "（暂未绑定项目或项目暂无核心文档）"}'
            )
            chat_messages = [{"role": "system", "content": system_prompt}]
            for m in state.get("messages", [])[-12:]:
                chat_messages.append({"role": m["role"], "content": m["text"]})
            chat_messages.append({
                "role": "user",
                "content": f"{text}\n\n当前画板内容：{json.dumps(state.get('cards', []), ensure_ascii=False)}"
            })


            try:
                base = config["baseUrl"].rstrip("/")
                resp = requests.post(
                    f"{base}/chat/completions",
                    headers={
                        "authorization": f"Bearer {config['apiKey']}",
                        "content-type": "application/json"
                    },
                    json={
                        "model": config["model"],
                        "temperature": 0.2,
                        "messages": chat_messages
                    },
                    timeout=30.0
                )
                if resp.status_code == 200:
                    payload = resp.json()
                    raw = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                    raw_clean = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
                    try:
                        parsed = json.loads(raw_clean)
                        reply_text = str(parsed.get("text", raw))
                        cards_val = parsed.get("cards", [])
                        if isinstance(cards_val, list):
                            new_cards = cards_val
                    except Exception:
                        reply_text = raw
                else:
                    reply_text = f"模型服务返回 HTTP {resp.status_code}"
            except Exception as exc:
                reply_text = f"模型请求失败：{exc}"

        if new_cards:
            now_ms = int(time.time() * 1000)
            existing_cards = state.get("cards", [])
            for i, c in enumerate(new_cards):
                c_id = c.get("id") or f"{now_ms}-{i}"
                # check if update
                updated = False
                for idx, ec in enumerate(existing_cards):
                    if ec.get("id") == c_id:
                        existing_cards[idx] = {**ec, **c}
                        updated = True
                        break
                if not updated:
                    existing_cards.append({"id": c_id, **c})
            state["cards"] = existing_cards

        state["messages"].append({"role": "assistant", "text": reply_text, "at": int(time.time() * 1000)})
        self.save_local_state(state)
        return {"text": reply_text, "cards": state.get("cards", [])}
