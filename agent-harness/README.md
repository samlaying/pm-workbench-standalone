# PM Workbench Standalone Agent Harness

Agent-Native CLI for PM Workbench Standalone, built following the [CLI-Anything](https://github.com/HKUDS/CLI-Anything) methodology.

## 快速安装

```bash
pip install -e .
```

安装后系统将获得全局命令：
```bash
which cli-anything-pm-workbench
```

## 使用指南

### 1. 交互式 REPL 模式
```bash
cli-anything-pm-workbench
```

### 2. 命令行与 Agent 消费模式
```bash
# 查看状态
cli-anything-pm-workbench --json project status

# 绑定项目
cli-anything-pm-workbench project bind /path/to/project

# 重新扫描文档
cli-anything-pm-workbench --json project scan

# 对话生成
cli-anything-pm-workbench --json chat send "生成产品路线图卡片"

# 管理卡片
cli-anything-pm-workbench --json card list
cli-anything-pm-workbench --json card get <card_id>
cli-anything-pm-workbench card add -t "新特性" -b "### 描述\n- 支持多工作区"
```

## 测试

```bash
python3 -m pytest cli_anything/pm_workbench/tests/ -v
```
