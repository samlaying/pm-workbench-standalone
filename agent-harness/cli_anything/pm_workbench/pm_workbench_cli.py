from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from typing import Any

import click

from cli_anything.pm_workbench.core.client import (
    DEFAULT_URL,
    WorkbenchClient,
    get_repo_root,
)
from cli_anything.pm_workbench.core.canvas import (
    add_card,
    delete_card,
    export_cards,
    get_card,
    import_card,
    list_cards,
    list_project_cards,
    update_card,
)
from cli_anything.pm_workbench.core.project import (
    bind_project,
    get_project_status,
    scan_current_project,
)
from cli_anything.pm_workbench.core.session import (
    clear_chat_history,
    get_chat_history,
    list_conversations,
    new_chat_session,
    open_conversation,
    send_chat_message,
)
from cli_anything.pm_workbench.utils.repl_skin import ReplSkin

VERSION = "0.1.0"


def print_output(ctx: click.Context, data: Any, human_callback=None):
    is_json = ctx.obj.get("json", False)
    if is_json:
        click.echo(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        if human_callback:
            human_callback(data)
        else:
            skin: ReplSkin = ctx.obj["skin"]
            if isinstance(data, dict):
                for k, v in data.items():
                    skin.status(str(k), str(v))
            else:
                click.echo(str(data))


@click.group(invoke_without_command=True)
@click.option("--json", "json_mode", is_flag=True, help="Output JSON for agent consumption.")
@click.option("--dry-run", is_flag=True, help="Simulate execution without modifying state.")
@click.option("--url", default=DEFAULT_URL, help="PM Workbench backend URL.")
@click.option("--offline", is_flag=True, help="Force local file mode without contacting server.")
@click.version_option(VERSION)
@click.pass_context
def cli(ctx: click.Context, json_mode: bool, dry_run: bool, url: str, offline: bool):
    """Agent-Native CLI for PM Workbench Standalone."""
    ctx.ensure_object(dict)
    client = WorkbenchClient(base_url=url, dry_run=dry_run, force_local=offline)
    skin = ReplSkin("pm_workbench", version=VERSION)
    ctx.obj["client"] = client
    ctx.obj["skin"] = skin
    ctx.obj["json"] = json_mode
    ctx.obj["dry_run"] = dry_run

    if ctx.invoked_subcommand is None:
        if json_mode:
            click.echo(json.dumps({"error": "No subcommand specified in --json mode", "version": VERSION}))
            ctx.exit(1)
        # Enter REPL
        run_repl(ctx)


# ── Project commands ───────────────────────────────────────────

@cli.group()
def project():
    """Manage projects and workspace binding."""
    pass


@project.command("bind")
@click.argument("path", type=click.Path())
@click.pass_context
def project_bind(ctx: click.Context, path: str):
    """Bind a local directory to the workspace and scan documents."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    result = bind_project(client, path)

    def show(res):
        projects = res.get("projects", [])
        items_count = sum(len(p.get("items", [])) for p in projects)
        skin.success(f"已成功绑定项目: {res.get('projectPath')}")
        skin.info(f"扫描发现 {items_count} 个需求/设计文档")

    print_output(ctx, result, show)


@project.command("status")
@click.pass_context
def project_status(ctx: click.Context):
    """View current project and workspace status."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    result = get_project_status(client)

    def show(res):
        skin.status("绑定项目", res.get("projectPath") or "(未绑定)")
        skin.status("服务状态", "在线 (HTTP 4317)" if res.get("serverOnline") else "离线 (本地存储)")
        skin.status("卡片数量", str(res.get("cardCount", 0)))
        skin.status("历史消息", str(res.get("messageCount", 0)))

    print_output(ctx, result, show)


@project.command("scan")
@click.pass_context
def project_scan(ctx: click.Context):
    """Rescan documents for the currently bound project."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    result = scan_current_project(client)

    def show(res):
        if "error" in res:
            skin.warning(res["error"])
        else:
            projects = res.get("projects", [])
            items = projects[0].get("items", []) if projects else []
            skin.success(f"重新扫描完成，共找到 {len(items)} 个文档")
            rows = [[it.get("name"), it.get("path")] for it in items[:15]]
            if rows:
                skin.table(["文档名", "路径"], rows)

    print_output(ctx, result, show)


@project.command("new-chat")
@click.option("--path", "-p", type=click.Path(), help="Project directory to bind before starting new chat.")
@click.pass_context
def project_new_chat(ctx: click.Context, path: str | None):
    """Start a new chat session under a project."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    if path:
        bind_project(client, path)
    result = new_chat_session(client)

    def show(res):
        skin.success(f"已在项目下开启新对话: {res.get('projectPath') or '(未绑定)'}")
        skin.status("画板卡片数量", str(len(res.get("cards", []))))

    print_output(ctx, result, show)


# ── Chat commands ──────────────────────────────────────────────

@cli.group()
def chat():
    """Interact with PM Workbench AI Agent."""
    pass


@chat.command("send")
@click.argument("text")
@click.option("--answer", default="draft", help="Workflow confirmation answer ('draft', 'deep', 'report').")
@click.pass_context
def chat_send(ctx: click.Context, text: str, answer: str):
    """Send a prompt or requirement to the PM Agent."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    result = client.send_message(text, auto_answer=answer)

    def show(res):
        reply = res.get("text", "")
        cards = res.get("cards", [])
        wf = res.get("workflow") or {}
        analysis = res.get("analysis") or wf.get("analysis")
        mem_suggs = res.get("memorySuggestions") or wf.get("memorySuggestions") or []

        # 1. Proactive Analysis & Recommendations
        if analysis:
            skills = analysis.get("skills", [])
            recs = analysis.get("recommendations", [])
            if skills:
                skin.status("主动调度技能", ", ".join(skills))
            for rec in recs:
                skin.info(f"💡 建议: {rec}")

        # 2. Mentor Review status
        if "review" in wf:
            rev = wf["review"]
            skin.status("导师审核", f"{rev.get('status')} ({rev.get('reviewer')})")
            for issue in rev.get("issues", []):
                skin.warning(f"  - {issue}")

        # 3. Response text
        skin.info(f"\n{reply}\n")

        # 4. Canvas cards
        if cards:
            skin.success(f"当前画板共有 {len(cards)} 张卡片")

        # 5. Memory suggestions
        if mem_suggs:
            skin.status("记忆建议", f"发现 {len(mem_suggs)} 条记忆更新需确认")
            for s in mem_suggs:
                target_label = "人物记忆" if s.get("target") == "person" else "项目记忆"
                skin.info(f"  [{target_label}] ({s.get('sourceSkill', 'Skill')}): {s.get('content', '')[:60]}...")

    print_output(ctx, result, show)


# ── Workflow commands ─────────────────────────────────────────

@cli.group()
def workflow():
    """Manage PM workflow confirmation and skill execution."""
    pass


@workflow.command("status")
@click.pass_context
def workflow_status(ctx: click.Context):
    """View current pending workflow and mentor review status."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    state = client.get_state()
    wf = state.get("workflow", {})

    def show(w):
        if not w:
            skin.info("当前没有活动中的工作流")
            return
        skin.status("状态", w.get("status", "unknown"))
        skin.status("请求", w.get("request", ""))
        skin.status("调度技能", ", ".join(w.get("skills", [])))
        for rec in w.get("recommendations", []):
            skin.info(f"💡 建议: {rec}")
        if "question" in w:
            skin.info(f"\n等待确认: {w['question'].get('question')}")
        if "review" in w:
            rev = w["review"]
            skin.status("导师审核", f"{rev.get('status')} ({rev.get('reviewer')})")
            for issue in rev.get("issues", []):
                skin.warning(f"  - {issue}")
        mem_suggs = w.get("memorySuggestions", [])
        if mem_suggs:
            skin.status("记忆建议", f"{len(mem_suggs)} 条待确认")
            for s in mem_suggs:
                target_label = "人物记忆" if s.get("target") == "person" else "项目记忆"
                skin.info(f"  - [{target_label}] {s.get('content', '')[:60]}...")

    print_output(ctx, wf, show)


@workflow.command("answer")
@click.argument("choice", default="draft")
@click.pass_context
def workflow_answer(ctx: click.Context, choice: str):
    """Answer pending workflow question (e.g. 'draft', 'deep', 'report')."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    res = client.answer_workflow(choice)

    def show(r):
        wf = r.get("workflow", {})
        skin.success(f"工作流已执行，状态: {wf.get('status')}")
        if "review" in wf:
            rev = wf["review"]
            skin.status("导师审核", f"{rev.get('status')} ({rev.get('reviewer')})")
            for issue in rev.get("issues", []):
                skin.warning(f"  - {issue}")
        mem_suggs = wf.get("memorySuggestions", [])
        if mem_suggs:
            skin.status("记忆建议", f"发现 {len(mem_suggs)} 条待确认更新")
            for s in mem_suggs:
                target_label = "人物记忆" if s.get("target") == "person" else "项目记忆"
                skin.info(f"  - [{target_label}] {s.get('content', '')[:60]}...")

    print_output(ctx, res, show)



@chat.command("history")
@click.option("--limit", "-n", type=int, default=10, help="Number of recent messages to show.")
@click.pass_context
def chat_history(ctx: click.Context, limit: int):
    """Show recent conversation messages."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    messages = get_chat_history(client, limit=limit)

    def show(msgs):
        if not msgs:
            skin.info("暂无历史消息")
            return
        rows = [[m.get("role", ""), m.get("text", "")[:60] + ("..." if len(m.get("text", "")) > 60 else "")] for m in msgs]
        skin.table(["角色", "内容摘要"], rows)

    print_output(ctx, messages, show)


@chat.command("clear")
@click.pass_context
def chat_clear(ctx: click.Context):
    """Clear conversation history."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    result = clear_chat_history(client)

    def show(_):
        skin.success("已清空所有对话历史")

    print_output(ctx, result, show)


@chat.command("new")
@click.option("--project", "-p", type=click.Path(), help="Project directory to bind before starting new chat.")
@click.pass_context
def chat_new(ctx: click.Context, project: str | None):
    """Start a new conversation session (clears messages, resets workflow)."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    if project:
        bind_project(client, project)
    result = new_chat_session(client)

    def show(res):
        skin.success("已开启新会话，前序卡片与消息已自动归档")
        skin.status("绑定项目", res.get("projectPath") or "(未绑定)")
        skin.status("画板卡片数量", str(len(res.get("cards", []))))
        skin.status("当前历史会话数", str(len(res.get("conversations", []))))

    print_output(ctx, result, show)


@chat.command("list")
@click.pass_context
def chat_list(ctx: click.Context):
    """List all saved conversations and their associated cards."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    conversations = list_conversations(client)
    state = client.get_state()
    current_id = state.get("currentConversationId", "")

    def show(items):
        if not items:
            skin.info("当前暂无历史会话（在有消息/卡片时执行 chat new 会自动归档）")
            return
        headers = ["会话 ID", "标题", "消息数", "卡片数", "当前"]
        rows = []
        for c in items:
            cid = str(c.get("id", ""))
            is_active = "★ 当前" if cid == current_id else ""
            rows.append([
                cid,
                c.get("title", "未命名"),
                f"{len(c.get('messages', []))} 条",
                f"{len(c.get('cards', []))} 张",
                is_active
            ])
        skin.table(headers, rows)

    print_output(ctx, conversations, show)


@chat.command("open")
@click.argument("conversation_id")
@click.pass_context
def chat_open(ctx: click.Context, conversation_id: str):
    """Switch to a saved conversation, restoring its messages and canvas cards."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    try:
        result = open_conversation(client, conversation_id)
    except Exception as exc:
        skin.error(f"切换会话失败: {exc}")
        return

    def show(res):
        skin.success(f"已恢复会话 [{conversation_id}]")
        skin.status("恢复消息数", str(len(res.get("messages", []))))
        skin.status("恢复卡片数", str(len(res.get("cards", []))))

    print_output(ctx, result, show)



# ── Card / Canvas commands ────────────────────────────────────

@cli.group()
def card():
    """Manage cards on the infinite canvas."""
    pass


@card.command("list")
@click.pass_context
def card_list(ctx: click.Context):
    """List all cards on the canvas."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    cards = list_cards(client)

    def show(items):
        if not items:
            skin.info("画板当前没有任何卡片")
            return
        rows = [
            [
                str(c.get("id")),
                str(c.get("title", "")),
                str(c.get("icon", "📄")),
                f"({c.get('x', 0)}, {c.get('y', 0)})"
            ]
            for c in items
        ]
        skin.table(["卡片 ID", "标题", "图标", "坐标 (x, y)"], rows)

    print_output(ctx, cards, show)


@card.command("get")
@click.argument("card_id")
@click.pass_context
def card_get(ctx: click.Context, card_id: str):
    """Get complete content of a single card."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    item = get_card(client, card_id)
    if not item:
        if ctx.obj.get("json"):
            click.echo(json.dumps({"error": f"Card {card_id} not found"}, ensure_ascii=False))
            ctx.exit(1)
        skin.error(f"未找到 ID 为 {card_id} 的卡片")
        ctx.exit(1)

    def show(c):
        skin.status("ID", c.get("id"))
        skin.status("标题", f"{c.get('icon', '')} {c.get('title')}")
        skin.status("坐标", f"({c.get('x', 0)}, {c.get('y', 0)})")
        click.echo("\n" + (c.get("body") or "") + "\n")

    print_output(ctx, item, show)


@card.command("add")
@click.option("--title", "-t", required=True, help="Card title.")
@click.option("--body", "-b", required=True, help="Markdown body content.")
@click.option("--x", type=int, default=None, help="X coordinate (auto-calculated if omitted).")
@click.option("--y", type=int, default=None, help="Y coordinate (auto-calculated if omitted).")
@click.option("--icon", default="📄", help="Emoji icon.")
@click.pass_context
def card_add(ctx: click.Context, title: str, body: str, x: int | None, y: int | None, icon: str):
    """Add a new card to the canvas."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    card_obj = add_card(client, title=title, body=body, x=x, y=y, icon=icon)

    def show(c):
        skin.success(f"已创建卡片 [{c.get('id')}]: {c.get('title')}")

    print_output(ctx, card_obj, show)


@card.command("update")
@click.argument("card_id")
@click.option("--title", "-t", default=None, help="New title.")
@click.option("--body", "-b", default=None, help="New body content.")
@click.option("--x", type=int, default=None, help="New X position.")
@click.option("--y", type=int, default=None, help="New Y position.")
@click.option("--icon", default=None, help="New icon.")
@click.pass_context
def card_update(ctx: click.Context, card_id: str, title: str | None, body: str | None, x: int | None, y: int | None, icon: str | None):
    """Update an existing card."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    try:
        updated = update_card(client, card_id=card_id, title=title, body=body, x=x, y=y, icon=icon)
    except KeyError:
        if ctx.obj.get("json"):
            click.echo(json.dumps({"error": f"Card {card_id} not found"}))
            ctx.exit(1)
        skin.error(f"未找到 ID 为 {card_id} 的卡片")
        ctx.exit(1)

    def show(c):
        skin.success(f"已更新卡片 [{c.get('id')}]: {c.get('title')}")

    print_output(ctx, updated, show)


@card.command("delete")
@click.argument("card_id")
@click.pass_context
def card_delete(ctx: click.Context, card_id: str):
    """Delete a card from the canvas."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    deleted = delete_card(client, card_id)

    def show(res):
        if res.get("deleted"):
            skin.success(f"已删除卡片 {card_id}")
        else:
            skin.warning(f"未找到卡片 {card_id}")

    print_output(ctx, {"deleted": deleted, "id": card_id}, show)


@card.command("export")
@click.option("-o", "--output", help="Output file path (JSON).")
@click.pass_context
def card_export(ctx: click.Context, output: str | None):
    """Export all canvas cards."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    res = export_cards(client, output_file=output)

    def show(r):
        if r.get("outputPath"):
            skin.success(f"成功导出 {r.get('total')} 张卡片到: {r.get('outputPath')}")
        else:
            skin.info(f"画板共有 {r.get('total')} 张卡片")

    print_output(ctx, res, show)


@card.command("project-cards")
@click.pass_context
def card_project_cards(ctx: click.Context):
    """List all cards across all conversations in the project."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    cards = list_project_cards(client)

    def show(items):
        if not items:
            skin.info("项目中暂无任何跨对话卡片")
            return
        rows = [
            [
                str(c.get("id")),
                str(c.get("title", "")),
                str(c.get("sourceConversationTitle", "当前对话")),
                str(c.get("icon", "📄")),
            ]
            for c in items
        ]
        skin.table(["卡片 ID", "标题", "所属会话", "图标"], rows)

    print_output(ctx, cards, show)


@card.command("import")
@click.argument("card_id")
@click.pass_context
def card_import(ctx: click.Context, card_id: str):
    """Import a card from another conversation into current conversation canvas."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    try:
        res = import_card(client, card_id)
    except KeyError:
        if ctx.obj.get("json"):
            click.echo(json.dumps({"error": f"Card {card_id} not found in project"}))
            ctx.exit(1)
        skin.error(f"未在项目中找到卡片: {card_id}")
        ctx.exit(1)

    def show(state):
        skin.success(f"已成功导入卡片 [{card_id}] 到当前对话画板")
        skin.status("当前卡片总数", str(len(state.get("cards", []))))

    print_output(ctx, res, show)


# ── Server commands ───────────────────────────────────────────

@cli.group()
def server():
    """Manage local server instance."""
    pass


@server.command("status")
@click.pass_context
def server_status(ctx: click.Context):
    """Check backend server status."""
    client: WorkbenchClient = ctx.obj["client"]
    skin: ReplSkin = ctx.obj["skin"]
    online = client.is_server_available()

    def show(_):
        if online:
            skin.success(f"PM Workbench 服务正常运行中 ({client.base_url})")
        else:
            skin.warning(f"PM Workbench 服务未在运行 ({client.base_url})，CLI 正使用本地存储模式")

    print_output(ctx, {"url": client.base_url, "online": online}, show)


@server.command("start")
@click.option("--port", default=4317, help="Server port.")
@click.pass_context
def server_start(ctx: click.Context, port: int):
    """Start local Node.js server."""
    skin: ReplSkin = ctx.obj["skin"]
    repo_root = get_repo_root()
    server_script = repo_root / "server.mjs"
    if not server_script.exists():
        skin.error(f"未找到服务入口文件: {server_script}")
        ctx.exit(1)

    skin.info(f"正在启动 PM Workbench 服务 (端口 {port})...")
    env = os.environ.copy()
    env["PORT"] = str(port)
    try:
        subprocess.run(["node", str(server_script)], cwd=str(repo_root), env=env)
    except KeyboardInterrupt:
        skin.info("\n服务已停止")


# ── Interactive REPL ───────────────────────────────────────────

def run_repl(ctx: click.Context):
    skin: ReplSkin = ctx.obj["skin"]
    client: WorkbenchClient = ctx.obj["client"]
    skin.print_banner()

    state = client.get_state()
    proj_path = state.get("projectPath", "")
    proj_name = os.path.basename(proj_path) if proj_path else "default"

    while True:
        try:
            prompt_str = skin.prompt(project_name=proj_name, modified=False)
            line = input(prompt_str).strip()
            if not line:
                continue
            if line.lower() in ["exit", "quit", "q"]:
                skin.print_goodbye()
                break

            args = shlex.split(line)
            # Invoke CLI with args
            try:
                cli.main(args=args, standalone_mode=False, obj=ctx.obj)
            except click.ClickException as e:
                e.show()
            except SystemExit:
                pass
            except Exception as e:
                skin.error(str(e))

            # Refresh project name in prompt
            st = client.get_state()
            if st.get("projectPath"):
                proj_name = os.path.basename(st.get("projectPath"))

        except (KeyboardInterrupt, EOFError):
            skin.print_goodbye()
            break


def main():
    cli()


if __name__ == "__main__":
    main()
