"""Runs untrusted code in throwaway Docker containers.

Stdlib only: this module is also copied into the standalone executor service
(executor_server.py), which is the only component that needs the Docker socket.
"""

import os
import subprocess

# (docker_image, command_inside_container)
# Code is always passed via stdin so there are no shell-escaping issues.
DOCKER_LANGS: dict[str, tuple[str, list[str]]] = {
    # Interpreters — read code from stdin
    "python": ("python:3.12-slim", ["python3", "-"]),
    "python3": ("python:3.12-slim", ["python3", "-"]),
    "javascript": ("node:20-alpine", ["node"]),
    "js": ("node:20-alpine", ["node"]),
    "typescript": ("denoland/deno:alpine", ["deno", "run", "-"]),
    "ts": ("denoland/deno:alpine", ["deno", "run", "-"]),
    "bash": ("alpine:latest", ["sh"]),
    "sh": ("alpine:latest", ["sh"]),
    "ruby": ("ruby:3-alpine", ["ruby"]),
    "rb": ("ruby:3-alpine", ["ruby"]),
    "php": ("php:8-cli-alpine", ["php"]),
    "perl": ("perl:5-slim", ["perl"]),
    "pl": ("perl:5-slim", ["perl"]),
    "elixir": ("elixir:1.17-alpine", ["elixir", "-"]),
    "ex": ("elixir:1.17-alpine", ["elixir", "-"]),
    "lua": ("nickblah/lua:5.4-alpine", ["lua", "-"]),
    # Compile languages — stdin is written to a file, then compiled and run
    "c": (
        "gcc:latest",
        ["sh", "-c", "cat>/tmp/main.c && gcc /tmp/main.c -o /tmp/main -lm && /tmp/main"],
    ),
    "cpp": (
        "gcc:latest",
        ["sh", "-c", "cat>/tmp/main.cpp && g++ /tmp/main.cpp -o /tmp/main && /tmp/main"],
    ),
    "c++": (
        "gcc:latest",
        ["sh", "-c", "cat>/tmp/main.cpp && g++ /tmp/main.cpp -o /tmp/main && /tmp/main"],
    ),
    "java": (
        "eclipse-temurin:21-jdk-alpine",
        ["sh", "-c", "cat>/tmp/Main.java && javac /tmp/Main.java -d /tmp && java -cp /tmp Main"],
    ),
    "go": (
        "golang:1.22-alpine",
        ["sh", "-c", "cat>/tmp/main.go && GOCACHE=/tmp/goc GOPATH=/tmp/gop go run /tmp/main.go"],
    ),
    "rust": (
        "rust:alpine",
        ["sh", "-c", "cat>/tmp/main.rs && rustc /tmp/main.rs -o /tmp/main && /tmp/main"],
    ),
    "rs": (
        "rust:alpine",
        ["sh", "-c", "cat>/tmp/main.rs && rustc /tmp/main.rs -o /tmp/main && /tmp/main"],
    ),
    "csharp": (
        "mono:latest",
        [
            "sh",
            "-c",
            "cat>/tmp/Program.cs && mcs /tmp/Program.cs -out:/tmp/Program.exe && mono /tmp/Program.exe",
        ],
    ),
    "cs": (
        "mono:latest",
        [
            "sh",
            "-c",
            "cat>/tmp/Program.cs && mcs /tmp/Program.cs -out:/tmp/Program.exe && mono /tmp/Program.exe",
        ],
    ),
}

SUPPORTED_LANGS = "python, javascript, typescript, bash, ruby, php, perl, elixir, lua, c, cpp, java, go, rust, csharp"

TIMEOUT_SECONDS = 30


def build_docker_cmd(image: str, cmd: list[str]) -> list[str]:
    flags = [
        "--rm",
        "--interactive",
        "--network=none",
        "--memory=256m",
        "--memory-swap=256m",
        "--cpus=0.5",
        "--pids-limit=128",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--read-only",
        "--user=65534:65534",
        "--env=HOME=/tmp",
        "--env=DENO_DIR=/tmp/.deno",
        "--tmpfs=/tmp:size=256m,mode=1777,exec",
        "--ulimit=nofile=256:256",
        "--ulimit=fsize=67108864:67108864",
    ]
    # e.g. SANDBOX_RUNTIME=runsc to run the containers under gVisor
    runtime = os.getenv("SANDBOX_RUNTIME", "").strip()
    if runtime:
        flags.append(f"--runtime={runtime}")
    return ["docker", "run", *flags, image, *cmd]


def run_code(code: str, language: str) -> dict:
    entry = DOCKER_LANGS.get(language.lower().strip())
    if entry is None:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language!r}. Supported: {SUPPORTED_LANGS}.",
            "exit_code": 1,
        }

    image, cmd = entry
    try:
        result = subprocess.run(
            build_docker_cmd(image, cmd),
            input=code,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        return {
            "stdout": result.stdout[:4000],
            "stderr": result.stderr[:2000],
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (30s limit).", "exit_code": 124}
    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": "Docker not found. Make sure Docker is installed and running.",
            "exit_code": 127,
        }
    except Exception as exc:
        return {"stdout": "", "stderr": f"Execution error: {exc}", "exit_code": 1}
