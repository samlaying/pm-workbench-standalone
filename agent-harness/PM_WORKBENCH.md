# PM Workbench Standalone — Software Architecture & CLI SOP

## 1. 概述
PM Workbench Standalone 是一个面向产品经理与研发团队的轻量级工作台，包含：
- **左侧项目导航**：扫描绑定目录下的需求与设计文档（`.md`, `.txt`, `.xml`），构建文档树；
- **中间持续对话**：集成 OpenAI 兼容的大模型后端（默认使用 RackNerd 代理 `gpt-5.5`），支持项目上下文感知并向画板沉淀结构化产出；
- **右侧无限画布**：卡片式管理 PRD、方案、会议纪要、任务画像等成果。

## 2. 数据与服务模型
- **数据存储**：`data/workspace.json`
  - `projectPath`: 绑定的本地工程目录绝对路径
  - `projects`: 扫描生成的文档树结构数组
  - `messages`: 历史对话记录列表 (`role`, `text`, `at`)
  - `cards`: 无限画板卡片列表 (`id`, `title`, `body`, `icon`, `x`, `y`)
- **HTTP 服务接口 (端口 4317)**：
  - `GET /api/state`: 获取当前完整工作区状态
  - `POST /api/bind`: 绑定新目录并重新扫描项目文档
  - `POST /api/message`: 发送对话输入（SSE 流式返回文本与画板卡片变动）
  - `POST /api/cards`: 批量更新或同步画板卡片

## 3. CLI Harness 设计原则
- **双模运行**：
  1. 命令行单次调用：`cli-anything-pm-workbench <group> <subcommand>`（支持 `--json` 供 Agent 消费，纯净输出）。
  2. 交互式 REPL：无参数启动，统一带有 ReplSkin 样式的品牌 Banner、Prompt 与快捷交互。
- **混合连接后端**：
  - 默认尝试连接运行中的 HTTP 实例 `http://127.0.0.1:4317`。
  - 若服务未运行，无缝自动回退到本地直接读取/写入 `data/workspace.json`，确保离线与无服务状态下 CLI 仍然完全可用。
- **自动保存与保护**：
  - 会话变更支持自动同步持久化。
  - 支持 `--dry-run` 预览操作而不实际修改文件。
