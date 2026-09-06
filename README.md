# PM Workbench Standalone

独立于 DSH 的 PM Workbench：左侧项目导航、中间持续可交互的对话、右侧独立无限画布。

## 启动

```bash
cp .env.example .env
# 默认复用 DSH 的 CLIProxy (RackNerd) 配置：`http://192.227.138.214:8317/v1`、`gpt-5.5`，并从 `~/.dsh/.credentials.yaml` 读取 `CLIPROXY_API_KEY`。需要时可用 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` 覆盖；不要把真实密钥提交到仓库。
node --env-file=.env server.mjs
```

默认地址：<http://127.0.0.1:4317>

## 设计依据

- `/Users/sam/Downloads/Harness Engineering字幕/做Agent时的注意事项总结.md`
- `/Users/sam/02-Obsidian/pm- harness/pm-workbench/ui/layout-spec.md`
- 接入 `/Users/sam/03-Code/02-Own/pm-skills` 的技能内容时，使用服务端受控目录读取，不把任意路径直接交给模型。

当前实现采用轻量文件后端，模型代理使用 OpenAI-compatible API；后续可把持久层替换为数据库而不改 UI 协议。
