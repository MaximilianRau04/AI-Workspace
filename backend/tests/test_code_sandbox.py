"""The code interpreter must start its containers with the hardened flag set."""

import subprocess

import tools


def test_execute_code_uses_hardened_docker_flags(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(tools.subprocess, "run", fake_run)
    result = tools.execute_code("print(1)", "python")
    assert result["exit_code"] == 0

    cmd = captured["cmd"]
    for flag in (
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user=65534:65534",
        "--pids-limit=128",
        "--memory-swap=256m",
    ):
        assert flag in cmd
    # Flags must come before the image name, otherwise they are passed to the program.
    assert cmd.index("--read-only") < cmd.index("python:3.12-slim")


def test_unsupported_language_does_not_start_a_container(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("docker must not be called")

    monkeypatch.setattr(tools.subprocess, "run", fail)
    assert tools.execute_code("x", "cobol")["exit_code"] == 1
