from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from click.testing import CliRunner
import pytest

from cli_anything.pm_workbench.pm_workbench_cli import cli


def _resolve_cli(cli_name: str = "cli-anything-pm-workbench") -> list[str]:
    """Resolve CLI executable path according to CLI-Anything standard."""
    force_installed = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED") == "1"
    found = shutil.which(cli_name)
    if force_installed:
        if not found:
            pytest.fail(f"CLI '{cli_name}' not found in PATH with CLI_ANYTHING_FORCE_INSTALLED=1")
        return [found]
    if found:
        return [found]
    # Fallback to python module execution
    return [sys.executable, "-m", "cli_anything.pm_workbench.pm_workbench_cli"]


class TestClickRunnerE2E:
    """E2E testing with Click CliRunner."""

    def test_cli_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Agent-Native CLI for PM Workbench" in result.output

    def test_project_and_cards_e2e(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        mock_file = tmp_path / "data" / "workspace.json"
        monkeypatch.setattr("cli_anything.pm_workbench.core.client.get_data_file", lambda: mock_file)
        runner = CliRunner()

        # Check status JSON
        res = runner.invoke(cli, ["--offline", "--json", "project", "status"])
        assert res.exit_code == 0
        data = json.loads(res.output)
        assert "serverOnline" in data
        assert data["cardCount"] == 0

        # Add card via JSON
        res = runner.invoke(cli, [
            "--offline", "--json", "card", "add",
            "-t", "PRD架构方案",
            "-b", "## 核心功能清单\n- 权限系统\n- 工作区同步",
            "--x", "120", "--y", "80"
        ])
        assert res.exit_code == 0
        card_data = json.loads(res.output)
        card_id = card_data["id"]
        assert card_data["title"] == "PRD架构方案"

        # List cards via JSON
        res = runner.invoke(cli, ["--offline", "--json", "card", "list"])
        assert res.exit_code == 0
        cards = json.loads(res.output)
        assert len(cards) == 1
        assert cards[0]["id"] == card_id

        # Get card
        res = runner.invoke(cli, ["--offline", "--json", "card", "get", card_id])
        assert res.exit_code == 0
        assert json.loads(res.output)["title"] == "PRD架构方案"

        # Update card
        res = runner.invoke(cli, ["--offline", "--json", "card", "update", card_id, "-t", "PRD方案(已定稿)"])
        assert res.exit_code == 0
        assert json.loads(res.output)["title"] == "PRD方案(已定稿)"

        # Export cards
        export_file = tmp_path / "exported_canvas.json"
        res = runner.invoke(cli, ["--offline", "--json", "card", "export", "-o", str(export_file)])
        assert res.exit_code == 0
        export_res = json.loads(res.output)
        assert export_res["total"] == 1
        assert export_file.exists()

        # Delete card
        res = runner.invoke(cli, ["--offline", "--json", "card", "delete", card_id])
        assert res.exit_code == 0
        assert json.loads(res.output)["deleted"] is True

        # Workflow status & answer
        res = runner.invoke(cli, ["--offline", "--json", "workflow", "status"])
        assert res.exit_code == 0

        res = runner.invoke(cli, ["--offline", "--json", "workflow", "answer", "draft"])
        assert res.exit_code == 0
        assert json.loads(res.output)["workflow"]["status"] == "approved"



class TestCLISubprocess:
    """Subprocess tests testing the resolved command line interface."""

    def test_subprocess_help(self):
        cmd = _resolve_cli("cli-anything-pm-workbench") + ["--help"]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        assert "Agent-Native CLI for PM Workbench" in proc.stdout

    def test_subprocess_json_status(self):
        cmd = _resolve_cli("cli-anything-pm-workbench") + ["--offline", "--json", "project", "status"]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(proc.stdout)
        assert "serverOnline" in data
        assert "cardCount" in data

    def test_subprocess_json_card_list(self):
        cmd = _resolve_cli("cli-anything-pm-workbench") + ["--offline", "--json", "card", "list"]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        cards = json.loads(proc.stdout)
        assert isinstance(cards, list)
