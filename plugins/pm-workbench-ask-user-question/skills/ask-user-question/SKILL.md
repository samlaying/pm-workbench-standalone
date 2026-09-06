---
name: ask-user-question
description: PM Workbench 内置结构化提问插件。暂停工作流，向用户展示 1-3 个可选问题，收到回答后恢复原任务。
---

# Ask User Question

工作流遇到范围、优先级、受众、交付形式或导师采纳判断时，必须先进入 `awaiting_confirmation`，不能替用户拍板。

问题协议：

```json
{"id":"question-id","question":"...","options":[{"id":"a","label":"...","description":"..."}]}
```

规则：每次最多 3 个问题；问题必须互斥、可执行；回答前不调用下游 Skill；回答后恢复原 workflow id，并保留上下文、项目和画布引用。
