# PM Workbench Agent Skills

本项目的 PM Skills 放在 `.agents/skills/`，由对话路由按用户意图选择。

| Skill | 触发场景 |
|---|---|
| `project-context-maintainer` | 项目背景、术语、决策和工作记录 |
| `meeting-notes-organizer` | 会议材料、纪要、行动项 |
| `task-arrangement-planner` | 任务拆解、推进计划、沟通话术 |
| `prd-writer` | 评审前 PRD、Happy Path、异常流程 |
| `prd-review-handler` | 评审反馈、修订 PRD、验收标准 |
| `update-writer` | 汇报、通知、进展同步、风险通报 |
| `meeting-coach` | 会议沟通表现和个人复盘 |
| `ai-pm-prd-builder` | AI / Agent 产品 PRD、节点契约和评测体系 |

公共规则位于 `.agents/skills/_shared/`。项目初始化时优先读取 `项目上下文.md`、`内部术语表.md`、`项目工作记录.md` 和 `任务.md`。
