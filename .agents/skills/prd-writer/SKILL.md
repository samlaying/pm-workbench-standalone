---
name: prd-writer
description: 当用户上传会议录音、会议纪要、历史 PRD、MT 反馈、需求口述，且目标是评审前写 PRD、更新 PRD 初稿、整理成可评审的需求文档并上传飞书时调用。适用于从材料提取业务信息，产出 V3.0 级别评审前 PRD、Happy Path、异常流程、交互说明、飞书文档链接和评审清单。不用于评审后拉评论、处理最新评论、对比飞书最新版、编写验收标准或回写评审修改；这些改用 prd-review-handler。
---

# PRD 写作 Skill（评审前）

## 触发条件

- 用户说“帮我写 PRD”“整理成需求文档”“更新 PRD 初稿”。
- 用户提供会议录音、会议纪要、访谈记录、历史 PRD、MT 反馈或散乱需求材料，目标是形成可评审文档。
- 用户要求“上传到飞书”“同步到飞书”“发给大家评审”，且尚未进入评审后反馈处理。

## 不触发

- 只整理会议纪要：改用 `meeting-notes-organizer`。
- 只拆领导安排、推进节奏、沟通话术：改用 `task-arrangement-planner`。
- 只维护项目背景、术语、决策：改用 `project-context-maintainer`。
- 已有飞书 PRD 且要拉最新评论、对比线上最新版、处理评审意见、写验收标准、回写飞书：改用 `prd-review-handler`。

## 入口原则

1. 先根据输入文件位置确定项目；无法判断时才问项目。
2. 先读 `../_shared/workflow-rules.md`，按公共规则完成项目识别、上下文获取和结构化确认；项目记忆规则由 `project-context-maintainer` 负责。
3. 判断当前任务是独立项目，还是大项目下的小需求点；按 `references/project-placement.md` 落盘。
4. 评审前文档不写验收标准；验收标准等评审后流程稳定再由 `prd-review-handler` 编写。
5. 全文用业务语言，不写技术实现术语：避免“接口、API、请求、返回、调用、前端、后端、服务端、数据库、状态码”等。
6. 凡涉及询问用户、让用户确认、选择方案、拍板范围或补充缺口，按公共规则做结构化确认。
7. 每个阶段结束后必须结构化确认；未确认事项显式标记为 `【待确认：...】`，不得写成已确认结论。

## 管道总览

```text
模糊指令 -> Phase -1 任务澄清
原始材料 -> Phase 0 信息提取与项目记忆
        -> Phase 0.5 产品机制骨架
        -> Phase 1 Happy Path
        -> Phase 2 异常场景
        -> Phase 3 结构化 PRD
        -> Phase 4 飞书上传
        -> Phase 5 提交评审
```

## 如何选择要读的原子文件

| 当前任务 | 先读 | 再按需读 |
|----------|------|----------|
| 刚进入 PRD 写作 | `references/core-principles.md`、`references/project-placement.md` | `references/phase-minus-1-clarify.md` |
| 材料提取、维护项目记忆 | `references/phase-0-intake.md` | `references/single-source.md` |
| 从功能描述升级产品机制 | `references/phase-0.5-product-mechanism.md` | `references/product-mechanism-design.md` |
| 只要正常路径或流程草稿 | `references/phase-1-happy-path.md` | `templates/happy-path-template.md`、`references/v0-to-v1.md` |
| 补异常、边界、兜底 | `references/phase-2-exceptions.md` | `references/v1-to-v2.md` |
| 组装完整评审前 PRD | `references/phase-3-prd-assembly.md` | `templates/prd-v3-template.md`、`references/v2-to-v3.md`、`references/quality-checklist.md` |
| 上传或同步飞书 | `references/phase-4-lark-upload.md` | `references/prd-visual-format.md`、`lark-docx-formatting.md` |
| 发起评审 | `references/phase-5-review-submit.md` | `references/quality-checklist.md` |

## 阶段推进规则

- 不必每次跑完整管道；根据用户目标和现有材料选择最小阶段。
- 缺项目、材料、交付物、受众或深度时，先进 Phase -1。
- 已有清晰需求但缺产品机制时，从 Phase 0.5 开始。
- 已有机制和正常路径时，可直接进 Phase 2 或 Phase 3。
- 用户只要求上传飞书，且本地 PRD 已确认，可直接进 Phase 4。
- 用户说“评审后”“按评论改”“拉飞书最新评论”“写验收标准”时，停止本 skill，切到 `prd-review-handler`。
- 任何阶段只要需要用户确认，必须先按公共规则做结构化确认；未得到确认前，只能写候选方案或 `【待确认：...】`。

## 输出约束

- 最终 PRD 遵循“具体页面/组件流程在前，整体流程总结在后”。
- 任何功能模块、页面、核心流程，都必须有功能定位：`让【目标用户】能【完成什么事】`，不超过 25 个字；说不清就先拆功能或砍范围。
- 所有设计决策必须服务功能定位；新增入口、字段、弹窗、流程分支不能解释它如何帮助用户完成这句话，就标记为背离并打回。
- 评审讲解材料必须拆进页面/异常/待确认/讲解提纲，不能整段塞进背景。
- 过程信息写入 `项目工作记录.md` 或需求点 `10-过程记录.md`，不写进最终 PRD 正文。

## 可用资源

| 类型 | 文件 | 说明 |
|------|------|------|
| 原则 | `references/core-principles.md` | 写作、汇报、评审走查、难缠用户原则 |
| 落位 | `references/project-placement.md` | 仓库项目结构与 PRD 落盘规则 |
| 阶段 | `references/phase-minus-1-clarify.md` | 模糊任务澄清 |
| 阶段 | `references/phase-0-intake.md` | 信息提取与项目记忆 |
| 阶段 | `references/phase-0.5-product-mechanism.md` | 产品机制骨架 |
| 阶段 | `references/phase-1-happy-path.md` | Happy Path |
| 阶段 | `references/phase-2-exceptions.md` | 异常场景 |
| 阶段 | `references/phase-3-prd-assembly.md` | 结构化 PRD |
| 阶段 | `references/phase-4-lark-upload.md` | 飞书上传 |
| 阶段 | `references/phase-5-review-submit.md` | 提交评审 |
| 模板 | `templates/happy-path-template.md` | Happy Path 模板 |
| 模板 | `templates/field-table.md` | 字段/交互表模板 |
| 模板 | `templates/prd-v3-template.md` | PRD V3.0 模板 |
| 模板 | `templates/alignment-note.md` | 任务澄清备忘 |
| 参考 | `references/v0-to-v1.md` | Happy Path 方法 |
| 参考 | `references/v1-to-v2.md` | 异常场景方法 |
| 参考 | `references/v2-to-v3.md` | 完整 PRD 方法 |
| 参考 | `references/product-mechanism-design.md` | 产品机制骨架详细方法 |
| 参考 | `references/single-source.md` | 去重与单一事实源 |
| 参考 | `references/quality-checklist.md` | 输出自检 |
| 参考 | `references/prd-visual-format.md` | 飞书视觉标记和图表转换 |
| 参考 | `lark-docx-formatting.md` | 飞书 DocxXML 格式指南 |
| 示例 | `examples/meeting-notes-input.md` | 输入示例 |
| 示例 | `examples/prd-output.md` | 输出示例 |
