# Test Plan & Results for cli-anything-pm-workbench

## 1. Test Architecture

### 1.1 Unit Tests (`test_core.py`)
- `test_parse_credential_refs`: 验证从 DSH `.credentials.yaml` 格式提取环境变量密钥的正确性。
- `test_scan_project`: 验证文件遍历深度限制（<= 2）、隐藏文件过滤、扩展名白名单（`.md`, `.txt`, `.xml`）。
- `test_client_local_state_and_cards`: 验证离线回退机制、卡片新增、读取、更新、删除与 JSON 导出。
- `test_client_chat_and_project_binding`: 验证工程绑定与离线/模拟对话历史记录。
- `test_client_chat_mocked_model_reply`: 验证大模型返回结构化 JSON 及卡片生成的解析流程。
- `test_dry_run_does_not_mutate`: 验证 `--dry-run` 标志不会触发任何文件持久化。

### 1.2 End-to-End Tests (`test_full_e2e.py`)
- `TestClickRunnerE2E`:
  - 命令行 `--help` 输出与版本展示。
  - `--json` 模式下 `project status`、`card add`、`card list`、`card update`、`card delete` 的完整状态流。
- `TestCLISubprocess`:
  - 使用 `_resolve_cli("cli-anything-pm-workbench")` 进行子进程实际执行测试。
  - 覆盖真实 PATH 发现与 `CLI_ANYTHING_FORCE_INSTALLED=1` 验证。

## 2. Test Execution Commands & Results

```bash
CLI_ANYTHING_FORCE_INSTALLED=1 python3 -m pytest cli_anything/pm_workbench/tests/ -v
```

### Result Summary

```
============================= test session starts ==============================
platform darwin -- Python 3.14.6, pytest-9.1.0, pluggy-1.6.0
collected 13 items

agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_parse_credential_refs PASSED [  7%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_scan_project PASSED [ 15%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_client_local_state_and_cards PASSED [ 23%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_client_chat_and_project_binding PASSED [ 30%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_client_chat_mocked_model_reply PASSED [ 38%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_dry_run_does_not_mutate PASSED [ 46%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_file_classification_and_skill_selection PASSED [ 53%]
agent-harness/cli_anything/pm_workbench/tests/test_core.py::test_workflow_answer PASSED [ 61%]
agent-harness/cli_anything/pm_workbench/tests/test_full_e2e.py::TestClickRunnerE2E::test_cli_help PASSED [ 69%]
agent-harness/cli_anything/pm_workbench/tests/test_full_e2e.py::TestClickRunnerE2E::test_project_and_cards_e2e PASSED [ 76%]
agent-harness/cli_anything/pm_workbench/tests/test_full_e2e.py::TestCLISubprocess::test_subprocess_help PASSED [ 84%]
agent-harness/cli_anything/pm_workbench/tests/test_full_e2e.py::TestCLISubprocess::test_subprocess_json_status PASSED [ 92%]
agent-harness/cli_anything/pm_workbench/tests/test_full_e2e.py::TestCLISubprocess::test_subprocess_json_card_list PASSED [100%]

============================== 13 passed in 0.31s ==============================

```

