---
name: "cli-anything-pm-workbench"
description: >-
  Command-line interface for PM Workbench Standalone — Project document scanning, continuous AI dialogue, and infinite canvas card management.
---

# cli-anything-pm-workbench

An agent-native, stateful command-line interface for PM Workbench Standalone. Enables AI agents and developers to bind local project directories, scan specifications, chat with the PM agent with structured output, and manipulate canvas cards programmatically.

## Installation

```bash
cd agent-harness && pip install -e .
```

**Prerequisites:**
- Python 3.10+
- Node.js 22+ (for running the optional PM Workbench web UI / backend server)

## Quick Start

```bash
# Show help
cli-anything-pm-workbench --help

# Start interactive REPL mode
cli-anything-pm-workbench

# View status with pure JSON output (agent mode)
cli-anything-pm-workbench --json project status

# Bind a local project directory
cli-anything-pm-workbench project bind /path/to/project

# Send prompt to PM Agent
cli-anything-pm-workbench chat send "根据需求生成 PRD 卡片"

# Manage canvas cards
cli-anything-pm-workbench --json card list
cli-anything-pm-workbench card add --title "架构设计" --body "### 模块拆分\n- 核心引擎\n- 存储适配器"
```

## Command Groups

### Project (`project`)

Manage project bindings and document scanning.

| Command | Description |
|---------|-------------|
| `project bind <path>` | Bind a local codebase directory and scan documents (`.md`, `.txt`, `.xml`). |
| `project scan` | Rescan documents in the currently bound project directory. |
| `project status` | Inspect current workspace bindings and online status. |

### Chat (`chat`)

Collaborate with the PM Agent.

| Command | Description |
|---------|-------------|
| `chat send <text>` | Send a message to PM Agent (returns reply text and canvas updates). |
| `chat history [-n N]` | View recent conversation history. |
| `chat clear` | Clear conversation history. |

### Card (`card`)

Manage structural cards on the infinite canvas.

| Command | Description |
|---------|-------------|
| `card list` | List all cards currently on the canvas. |
| `card get <id>` | Retrieve full Markdown content of a specific card. |
| `card add` | Create a new card (`--title`, `--body`, `--x`, `--y`, `--icon`). |
| `card update <id>` | Modify an existing card's title, body, position, or icon. |
| `card delete <id>` | Remove a card from the canvas. |
| `card export [-o path]` | Export canvas cards to JSON file. |

### Server (`server`)

Manage local server daemon.

| Command | Description |
|---------|-------------|
| `server status` | Check whether backend HTTP server (`http://127.0.0.1:4317`) is running. |
| `server start [--port 4317]` | Start the Node.js backend server. |

## Agent Guidelines

- Always pass `--json` when running in non-interactive agent pipelines to receive clean machine-readable data.
- Pass `--offline` if you want to inspect or manipulate local state directly without attempting network requests to the HTTP daemon.
- Use `--dry-run` to preview state changes safely.
