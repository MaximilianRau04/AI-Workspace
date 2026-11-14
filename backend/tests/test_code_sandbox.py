"""The code interpreter must start its containers with the hardened flag set."""

import json
import subprocess
import threading
from http.server import ThreadingHTTPServer

import pytest

import executor_server
import sandbox
import tools

TOKEN = "executor-test-token-123456"


def test_run_code_uses_hardened_docker_flags(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.delenv("SANDBOX_RUNTIME", raising=False)
    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    result = sandbox.run_code("print(1)", "python")
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
    assert not any(f.startswith("--runtime") for f in cmd)
    # Flags must come before the image name, otherwise they are passed to the program.
    assert cmd.index("--read-only") < cmd.index("python:3.12-slim")


def test_sandbox_runtime_is_configurable(monkeypatch):
    monkeypatch.setenv("SANDBOX_RUNTIME", "runsc")
    cmd = sandbox.build_docker_cmd("alpine:latest", ["sh"], "sandbox-test")
    assert "--runtime=runsc" in cmd
    assert cmd.index("--runtime=runsc") < cmd.index("alpine:latest")


def test_timeout_kills_the_container(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[:2] == ["docker", "run"]:
            raise subprocess.TimeoutExpired(cmd, kwargs.get("timeout"))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    result = sandbox.run_code("while True: pass", "python")

    assert result["exit_code"] == 124
    name_flag = next(f for f in calls[0] if f.startswith("--name="))
    name = name_flag.split("=", 1)[1]
    assert name.startswith("sandbox-")
    assert calls[1] == ["docker", "kill", name]


def test_container_names_are_unique(monkeypatch):
    names = []

    def fake_run(cmd, **kwargs):
        names.append(next(f for f in cmd if f.startswith("--name=")))
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    sandbox.run_code("1", "python")
    sandbox.run_code("1", "python")
    assert len(set(names)) == 2


def test_concurrent_runs_are_limited(monkeypatch):
    limit = 2
    monkeypatch.setattr(sandbox, "_slots", threading.BoundedSemaphore(limit))
    monkeypatch.setattr(sandbox, "QUEUE_TIMEOUT_SECONDS", 0.2)
    release = threading.Event()
    running = []
    lock = threading.Lock()
    peak = [0]

    def fake_run(cmd, **kwargs):
        with lock:
            running.append(1)
            peak[0] = max(peak[0], len(running))
        release.wait(5)
        with lock:
            running.pop()
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    results = []
    threads = [
        threading.Thread(target=lambda: results.append(sandbox.run_code("1", "python")))
        for _ in range(limit + 1)
    ]
    for t in threads:
        t.start()
    # The extra request must give up while the others still hold their slots.
    threads[-1].join(2)
    busy = [r for r in results if "busy" in r["stderr"]]
    release.set()
    for t in threads:
        t.join(5)

    assert peak[0] == limit
    assert len(busy) == 1
    assert sum(r["stdout"] == "ok" for r in results) == limit


def test_app_waits_longer_than_the_executor_can_take():
    # queue wait + run time + `docker kill` (15s) must fit into the app's request timeout
    worst_case = sandbox.QUEUE_TIMEOUT_SECONDS + sandbox.TIMEOUT_SECONDS + 15
    assert tools.EXECUTOR_REQUEST_TIMEOUT > worst_case


def test_unsupported_language_does_not_start_a_container(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("docker must not be called")

    monkeypatch.setattr(sandbox.subprocess, "run", fail)
    assert sandbox.run_code("x", "cobol")["exit_code"] == 1


def test_execute_code_runs_locally_without_executor_url(monkeypatch):
    monkeypatch.delenv("CODE_EXECUTOR_URL", raising=False)
    monkeypatch.setattr(sandbox, "run_code", lambda code, lang: {"local": True})
    assert tools.execute_code("x", "python") == {"local": True}


@pytest.fixture
def executor(monkeypatch):
    calls = []

    def fake_run_code(code, language):
        calls.append((code, language))
        return {"stdout": "remote", "stderr": "", "exit_code": 0}

    monkeypatch.setattr(sandbox, "run_code", fake_run_code)
    server = ThreadingHTTPServer(("127.0.0.1", 0), executor_server.make_handler(TOKEN))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", calls
    server.shutdown()
    server.server_close()


def test_execute_code_uses_remote_executor(executor, monkeypatch):
    url, calls = executor
    monkeypatch.setenv("CODE_EXECUTOR_URL", url)
    monkeypatch.setenv("CODE_EXECUTOR_TOKEN", TOKEN)
    result = tools.execute_code("print(1)", "python")
    assert result == {"stdout": "remote", "stderr": "", "exit_code": 0}
    assert calls == [("print(1)", "python")]


def test_executor_rejects_wrong_token(executor, monkeypatch):
    url, calls = executor
    monkeypatch.setenv("CODE_EXECUTOR_URL", url)
    monkeypatch.setenv("CODE_EXECUTOR_TOKEN", "wrong-token-0000000000")
    result = tools.execute_code("print(1)", "python")
    assert result["exit_code"] == 1
    assert "unavailable" in result["stderr"]
    assert calls == []


def test_executor_rejects_malformed_body(executor):
    import urllib.error
    import urllib.request

    url, calls = executor
    req = urllib.request.Request(
        url + "/run",
        data=json.dumps({"image": "evil", "cmd": ["sh"]}).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == 400
    assert calls == []
