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
    if re.search(r"调研|差异|渠道|对比|接入", text):
        skills.append("task-arrangement-planner")
        skills.append("project-context-maintainer")
        skills.append("ai-pm-prd-builder")
    return list(dict.fromkeys(skills if skills else ["project-context-maintainer"]))


SKILL_META = {
    "task-arrangement-planner": {"label": "任务拆解与分工", "icon": "📋"},
    "project-context-maintainer": {"label": "项目背景与决策记忆", "icon": "🧠"},
    "ai-pm-prd-builder": {"label": "产品能力与矩阵契约", "icon": "🤖"},
    "prd-writer": {"label": "需求与业务流程PRD", "icon": "📄"},
    "prd-review-handler": {"label": "评审修改与验收标准", "icon": "✅"},
    "update-writer": {"label": "进展同步与风险通报", "icon": "📢"},
    "meeting-notes-organizer": {"label": "会议纪要与行动项", "icon": "📝"},
    "meeting-coach": {"label": "沟通表现与复盘画像", "icon": "🎯"},
    "deliverable-template": {"label": "最终交付模版", "icon": "📐"},
}


def build_deliverable_template(request: str = "", results: list[dict[str, Any]] | None = None) -> dict[str, str] | None:
    req = str(request or "").strip()
    if not req:
        return None
    is_channel = bool(re.search(r"调研|差异|渠道|对比|接入|竞品|选型", req, re.IGNORECASE))
    is_prd = bool(re.search(r"prd|需求|流程", req, re.IGNORECASE))
    is_task = bool(re.search(r"任务|推进|拆解|安排|计划|分工", req))
    is_meeting = bool(re.search(r"会议|纪要|录音|行动项", req))

    if is_channel:
        return {
            "title": "【最终交付模版】渠道流程与能力差异评估矩阵 & 汇报框架",
            "body": """### 📐 标准交付物模版：渠道流程与能力差异评估矩阵

> **使用说明**：本模版包含**《各渠道能力与流程差异评估矩阵（填报表）》**、**《向领导汇报5段式框架》**及**《二人分工推进追踪表》**，可直接复制、填写并向领导交付。

#### 一、各渠道能力差异与接入流程评估矩阵（可直接编辑填写）

| 评估维度 / 渠道 | 飞书 (Feishu) | 企业微信 (WeCom) | 微信 (WeChat / 公众号 / 企微互通) | 钉钉 (DingTalk) | 评估说明 / 差异小结 |
|---|---|---|---|---|---|
| **接入凭证与鉴权** | 自建应用 (AppID / AppSecret) | 企微自建应用 (AgentID / Secret) | 公众号/服务号凭证或企微互通绑定 | 开放平台 (AppKey / AppSecret) | 微信生态个人号无官方凭证，风控最高 |
| **网络与部署要求** | 支持长连接/Webhook，需公网或穿透 | 必须配置固定公网可信IP与域名 | 需配置外网服务器URL与Token校验 | 支持Stream模式免公网IP接入 | 钉钉Stream与飞书长连接适合内网与本地快速调测 |
| **消息双向收发** | ✅ 支持文本、富文本、卡片交互、事件订阅 | ✅ 支持文本、Markdown、图文推送与回调 | ⚠️ 个人号高风控，公众号模板消息受限 | ✅ 支持文本、Markdown、互动卡片与长连接 | 飞书/企微/钉钉均满足生产级消息双向收发 |
| **文档与知识库联动** | ✅ 原生打通云文档与知识库读写API | ⚠️ 微盘接口能力受限，需企业级授权 | ❌ 不支持原生企业级文档交互 | ⚠️ 需单独申请钉钉文档权限与组织授权 | **典型差异**：Hermes接入后仅收发消息，无法直接读写文档 |
| **CLI与宿主双向控制** | 需适配Agent中转指令下发并回调 | 需通过应用菜单或指令服务联动 | 极难实现安全可靠的双向宿主控制 | 依托互动卡片与流式回调驱动控制命令 | **典型差异**：Workbuddy仅本地CLI，无法通过IM双向操作 |
| **卡片交互与表单提交** | ✅ 消息卡片支持按钮、下拉、表单提交 | ✅ 支持交互卡片与任务卡片 | ❌ 仅支持基础自定义菜单或外链网页 | ✅ 互动卡片支持高频实时局部刷新 | 飞书与钉钉卡片交互体验最佳 |
| **主要技术阻碍与风控** | 权限申请需租户管理员审批 | 外部群与客户联系人权限链条长 | 协议封号风险极高，严禁用于生产核心 | 接口文档分支多，配置与权限较为繁琐 | 微信个人号生态禁止作为企业核心基础设施 |
| **落地建议优先级** | **P0（首选推荐）** | **P1（企业协同备选）** | **暂缓（风险过高）** | **P1（技术互补备选）** | 优先飞书打通全能力闭环，钉钉作为免公网备选 |

---

#### 二、向领导汇报材料框架（5段式汇报标准结构）

1. **调研背景与核心目标**：明确本次调研重点解决渠道生态接入差异，摸清 Hermes（弱文档联动）与 Workbuddy（纯 CLI 无 IM 操作）的能力瓶颈。
2. **核心选型结论 (TL;DR)**：
   - 渠道能力呈现“基础消息易打通、文档与宿主控制存在生态壁垒”的明显分层。
   - 建议方案：采用“统一消息网关 + 宿主控制适配层”双层架构，首期打通飞书完整协同能力。
3. **关键产品与渠道能力断层比对**（Hermes vs Workbuddy vs 目标架构）。
4. **二人分工与推进计划**（按渠道与技术层级拆分并行推进）。
5. **需要领导/跨团队协助事项**（各渠道开发者账号审批、测试租户授权）。

---

#### 三、二人分工与执行推进追踪表（可直接认领）

| 渠道 / 模块 | 责任人 | 核心任务与交付项 | 预期产出格式 | 截止时间 | 当前状态 |
|---|---|---|---|---|---|
| **飞书 & 钉钉接入方案** | [认领人 A] | 验证长连接/Stream模式、打通文档API与卡片回调 | 《飞书/钉钉接入流程与Demo验证》 | T+2 | [待认领] |
| **企微 & 微信生态方案** | [认领人 B] | 梳理企微权限链条、输出微信风险报告与Hermes差异 | 《企微接入规范与微信风控分析》 | T+3 | [待认领] |
| **统一汇报材料整合** | [认领人 A + B] | 填充评估矩阵、编写汇报 PPT/飞书文档并组织对齐 | 《渠道接入选型评估与分工汇报》 | T+5 | [待认领] |"""
        }

    if is_prd:
        return {
            "title": "【最终交付模版】标准产品需求文档 (PRD) 规范模版",
            "body": """### 📐 标准交付物模版：产品需求文档 (PRD) 框架

#### 一、文档基本信息
- **文档版本**：V1.0
- **撰写人**：[PM姓名]
- **评审状态**：[待评审 / 评审中 / 已定稿]

#### 二、需求背景与业务价值
1. **业务背景**：[解决什么业务/产品背景下的什么痛点]
2. **目标用户**：[核心目标用户群体与典型画像]
3. **业务价值与目标**：[定性价值与定量核心指标目标]

#### 三、功能清单与优先级矩阵
| 功能模块 | 子功能点 | 需求描述 | 优先级 | 对应角色 | 交付排期 |
|---|---|---|---|---|---|
| [模块1] | [功能A] | [描述] | P0 | [用户/管理员] | [Sprint 1] |
| [模块1] | [功能B] | [描述] | P1 | [用户] | [Sprint 2] |

#### 四、核心业务流程与 Happy Path
- **主流程 (Happy Path)**：[步骤1 -> 步骤2 -> 步骤3 -> 成功闭环]
- **异常分支与容错机制**：
  - [异常分支 1]：网络超时或服务不可用 -> [降级与重试机制]
  - [异常分支 2]：输入格式不合法或校验失败 -> [明确错误提示]

#### 五、数据指标与上线验收标准 (DoD)
1. **关键埋点需求**：[事件名、触发时机、上报参数]
2. **上线验收标准 (Definition of Done)**：
   - [ ] 主流程与核心异常用例 100% 通过测试；
   - [ ] 关键业务指标监控与告警看板已配置；
   - [ ] 上线发版通知与用户操作指引已就绪。"""
        }

    if is_task:
        return {
            "title": "【最终交付模版】任务执行推进与分工追踪模版 (WBS)",
            "body": """### 📐 标准交付物模版：任务推进与分工追踪 (WBS)

#### 一、任务里程碑规划
| 里程碑节点 | 核心目标 | 预计完成时间 | 责任人 | 交付状态 |
|---|---|---|---|---|
| **M1: 方案对齐** | 完成方案细化与技术可行性评审 | T+2 | [负责人] | [进行中] |
| **M2: 开发联调** | 完成核心功能开发与联调 | T+7 | [负责人] | [待开始] |
| **M3: 验证上线** | 完成测试验收与上线发布 | T+10 | [负责人] | [待开始] |

#### 二、任务详细拆解与责任矩阵 (WBS)
| 模块/阶段 | 任务细项 | 详细要求与验收产出 | 责任人 | 依赖前置 | 截止时间 |
|---|---|---|---|---|---|
| [阶段一] | [任务 1.1] | [具体产出标准] | [责任人] | 无 | [时间] |
| [阶段一] | [任务 1.2] | [具体产出标准] | [责任人] | [任务 1.1] | [时间] |
| [阶段二] | [任务 2.1] | [具体产出标准] | [责任人] | [阶段一] | [时间] |

#### 三、风险登记与应对预案
| 风险项 | 影响程度 | 发生概率 | 应对预案与规避措施 | 责任人 |
|---|---|---|---|---|
| [风险 1] | 高 / 中 / 低 | 高 / 中 / 低 | [具体的降级、备选或止损方案] | [跟踪人] |"""
        }

    if is_meeting:
        return {
            "title": "【最终交付模版】结构化会议纪要与行动项跟踪模版",
            "body": """### 📐 标准交付物模版：结构化会议纪要与行动项

#### 一、会议基本信息
- **会议主题**：[填写会议主题]
- **会议时间**：[日期与时段]
- **参会人员**：[参会团队与名单]

#### 二、核心背景与讨论要点
1. **议题 1**：[核心议题背景与主要争论点]
2. **议题 2**：[各方诉求与技术/业务约束]

#### 三、关键决策结论 (Decisions)
- [x] **决策 1**：[达成一致的明确结论]
- [x] **决策 2**：[方案选型或排期敲定结果]

#### 四、行动项清单 (Action Items)
| 事项序号 | 行动项内容 | 责任人 | 交付产出要求 | 截止时间 | 当前状态 |
|---|---|---|---|---|---|
| 1 | [具体行动任务] | [责任人] | [可验收文档/成果] | [精确到日] | [待认领] |
| 2 | [具体行动任务] | [责任人] | [可验收文档/成果] | [精确到日] | [待认领] |"""
        }

    return {
        "title": "【最终交付模版】标准化交付物框架与推进模版",
        "body": """### 📐 标准交付物模版：交付框架与执行推进

#### 一、交付物核心目标与范围
- **目标陈述**：[简明扼要说明本次交付的核心价值与预期效果]
- **交付范围**：[明确包含项 In-scope 与不包含项 Out-of-scope]

#### 二、方案全景评估与执行标准
| 维度 / 模块 | 现状与核心诉求 | 推荐方案与标准 | 预期收益 | 关键验收指标 |
|---|---|---|---|---|
| [模块 1] | [现状分析] | [执行标准] | [收益点] | [衡量标准] |
| [模块 2] | [现状分析] | [执行标准] | [收益点] | [衡量标准] |

#### 三、下一步执行与推进安排
| 序号 | 交付任务 | 负责角色 | 预期输出成果 | 截止时间 |
|---|---|---|---|---|
| 1 | [任务 A] | [负责人] | [输出文档/成果] | [时间] |
| 2 | [任务 B] | [负责人] | [输出文档/成果] | [时间] |"""
    }


def merge_skill_results(results: list[dict[str, Any]], request: str = "") -> dict[str, Any]:
    all_cards = []
    text_sections = []
    for idx, r in enumerate(results):
        skill = r.get("skill", "agent")
        meta = SKILL_META.get(skill, {"label": skill, "icon": "▧"})
        text = r.get("text", "")
        text_sections.append(f"【{skill}】\n{text}")

        cards = r.get("cards")
        if cards and isinstance(cards, list):
            for c_idx, c in enumerate(cards):
                all_cards.append({
                    "id": f"skill-{idx}-{c_idx}",
                    "skill": skill,
                    "skillLabel": meta["label"],
                    "icon": c.get("icon") or meta["icon"],
                    "title": c.get("title") or f"【{meta['label']}】产出模块",
                    "body": c.get("body") or text,
                    "x": 80 + (len(all_cards) % 3) * 470,
                    "y": 80 + (len(all_cards) // 3) * 390,
                })
        else:
            all_cards.append({
                "id": f"skill-{idx}",
                "skill": skill,
                "skillLabel": meta["label"],
                "icon": meta["icon"],
                "title": f"【{meta['label']}】交付模块",
                "body": text,
                "x": 80 + (len(all_cards) % 3) * 470,
                "y": 80 + (len(all_cards) // 3) * 390,
            })

    has_template = any(c.get("skill") == "deliverable-template" or "最终交付模版" in c.get("title", "") for c in all_cards)
    if not has_template and request:
        template = build_deliverable_template(request, results)
        if template:
            all_cards.append({
                "id": f"skill-template-{int(time.time() * 1000)}",
                "skill": "deliverable-template",
                "skillLabel": "最终交付模版",
                "icon": "📐",
                "title": template["title"],
                "body": template["body"],
                "x": 80 + (len(all_cards) % 3) * 470,
                "y": 80 + (len(all_cards) // 3) * 390,
            })

    if any(c.get("skill") == "deliverable-template" or "最终交付模版" in c.get("title", "") for c in all_cards):
        text_sections.append("---\n### 📐【最终交付模版】\n已在画板生成独立的【最终交付模版】卡片，包含规范评估矩阵、直接可用填报表格与汇报框架，可直接复制或按需填写交付给领导及团队。")

    return {
        "text": "\n\n".join(text_sections),
        "cards": all_cards,
    }


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


def build_project_graph(
    project: dict[str, Any] | None,
    request: str,
    conversation_id: str = "main",
    results: list[dict[str, Any]] | None = None,
    cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    now = int(time.time() * 1000)
    project_id = (project or {}).get("id") or (project or {}).get("name") or "unbound-project"
    requirement = {
        "id": f"requirement-{now}",
        "projectId": project_id,
        "type": "requirement",
        "title": str(request or "未命名需求")[:80],
        "status": "active",
        "createdAt": now,
    }
    conversation = {
        "id": conversation_id or f"conversation-{now}",
        "projectId": project_id,
        "type": "conversation",
        "title": str(request or "新对话")[:32],
        "createdAt": now,
    }
    nodes = [requirement, conversation]
    edges = [
        {
            "id": f"edge-{now}-requirement",
            "source": requirement["id"],
            "target": conversation["id"],
            "kind": "contains",
            "createdBy": "agent",
        }
    ]

    def add_node(node: dict[str, Any], parent: dict[str, Any] = conversation):
        nodes.append(node)
        edges.append({
            "id": f"edge-{now}-{len(edges)}",
            "source": parent["id"],
            "target": node["id"],
            "kind": "agent_link",
            "createdBy": "agent",
            "reason": f"由 {node.get('skill') or node.get('type')} 产生",
        })

    for index, card in enumerate(cards or []):
        title = card.get("title", "")
        is_deliv = bool(re.search(r"模版|模板|PRD|汇报|纪要", title))
        is_skel = bool(re.search(r"模版|模板", title))
        add_node({
            "id": f"deliverable-{now}-{index}",
            "projectId": project_id,
            "conversationId": conversation["id"],
            "type": "deliverable" if is_deliv else "analysis",
            "title": title,
            "content": card.get("body", ""),
            "skill": card.get("skill"),
            "status": "skeleton" if is_skel else "draft",
            "position": {
                "x": 520 + (index % 3) * 360,
                "y": 140 + (index // 3) * 280,
            },
            "createdAt": now,
        })

    for index, result in enumerate(results or []):
        add_node({
            "id": f"skill-{now}-{index}",
            "projectId": project_id,
            "conversationId": conversation["id"],
            "type": "analysis",
            "title": result.get("skill", "skill"),
            "content": result.get("text", ""),
            "skill": result.get("skill"),
            "status": "complete",
            "position": {
                "x": 100 + (index % 3) * 360,
                "y": 480 + (index // 3) * 280,
            },
            "createdAt": now,
        })

    memory_results = build_memory_suggestions(results or [])
    for index, memory in enumerate(memory_results):
        target_name = "人物" if memory.get("target") == "person" else "项目"
        add_node({
            "id": f"memory-{now}-{index}",
            "projectId": project_id,
            "conversationId": conversation["id"],
            "type": "memory",
            "title": f"{target_name}记忆候选",
            "content": memory.get("content", ""),
            "skill": memory.get("sourceSkill"),
            "status": "needs_confirmation",
            "requiresConfirmation": True,
            "position": {
                "x": 100 + index * 360,
                "y": 900,
            },
            "createdAt": now,
        })

    return {
        "projectId": project_id,
        "requirement": requirement,
        "conversation": conversation,
        "nodes": nodes,
        "edges": edges,
        "updatedAt": now,
    }


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

    def get_project_cards(self) -> list[dict[str, Any]]:
        """Get all cards across all conversations in the project."""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.get(f"{self.base_url}/api/project/cards", timeout=5.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        curr_id = state.get("currentConversationId", "current")
        cards = []
        for conv in state.get("conversations", []):
            for c in conv.get("cards", []):
                cards.append({
                    **c,
                    "sourceConversationId": conv.get("id"),
                    "sourceConversationTitle": conv.get("title", "历史对话"),
                })
        for c in state.get("cards", []):
            cards.append({
                **c,
                "sourceConversationId": curr_id,
                "sourceConversationTitle": "当前对话",
            })
        return cards

    def import_project_card(self, card_id: str) -> dict[str, Any]:
        """Import a card from another conversation into current conversation canvas."""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.post(
                    f"{self.base_url}/api/project/cards/import",
                    json={"id": card_id},
                    timeout=5.0,
                )
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        all_cards = self.get_project_cards()
        target = next((c for c in all_cards if c.get("id") == card_id), None)
        if not target:
            raise KeyError(f"Card with id '{card_id}' not found in project")
        new_id = f"{target['id']}-copy-{int(time.time() * 1000)}"
        imported = {
            **target,
            "id": new_id,
            "sourceConversationId": state.get("currentConversationId", "current"),
        }
        state.setdefault("cards", []).append(imported)
        self.save_local_state(state)
        return state

    def get_graph(self) -> dict[str, Any]:
        """Get the project requirement graph (nodes and edges)."""
        if self.is_server_available() and not self.dry_run:
            try:
                resp = requests.get(f"{self.base_url}/api/graph", timeout=5.0)
                if resp.status_code == 200:
                    return resp.json()
            except Exception:
                pass
        state = self.load_local_state()
        return state.get("graph") or {"nodes": [], "edges": []}

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
