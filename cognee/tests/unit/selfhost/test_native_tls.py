"""Exercise maintained listeners with disposable certificates and an ASGI fixture."""

import concurrent.futures
import http.client
import json
import os
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
ADAPTER = ROOT / "cognee/api/native_tls.py"


def eventually(check):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, AssertionError):
            pass
        time.sleep(0.05)
    raise AssertionError("Timed out waiting for disposable listener")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def certificates(tmp_path):
    for name in ("one", "two"):
        directory = tmp_path / name
        directory.mkdir()
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost",
                "-keyout",
                str(directory / "privkey.pem"),
                "-out",
                str(directory / "fullchain.pem"),
            ],
            check=True,
            capture_output=True,
        )
    (tmp_path / "bad").mkdir()
    (tmp_path / "current").symlink_to("one")
    return tmp_path


class Running:
    def __init__(self, directory, **extra):
        self.directory = directory
        self.http = free_port()
        self.https = free_port()
        self.events = directory / "events"
        self.log = directory / "listener.log"
        self.events.write_text("")
        self.stream = self.log.open("w")
        env = dict(
            os.environ,
            ASGI_APP="fixture:app",
            BIND_ADDRESS="127.0.0.1",
            HTTP_PORT=str(self.http),
            TLS_PORT=str(self.https),
            TLS_DIRECTORY=str(directory / "current"),
            EVENTS=str(self.events),
            DRAIN_SECONDS="5",
            PYTHONPATH=str(Path(__file__).parent),
        )
        env.update(extra)
        self.process = subprocess.Popen(
            [sys.executable, str(ADAPTER)], env=env, stdout=self.stream, stderr=self.stream
        )

    def request(self, tls=False, path="/identity", headers=None, body=None):
        if tls:
            context = ssl.create_default_context()
            for name in ("one", "two"):
                context.load_verify_locations(str(self.directory / name / "fullchain.pem"))
            conn = http.client.HTTPSConnection("localhost", self.https, context=context, timeout=5)
        else:
            conn = http.client.HTTPConnection("localhost", self.http, timeout=5)
        try:
            conn.request(
                "POST" if body is not None else "GET", path, body=body, headers=headers or {}
            )
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read().decode()
        finally:
            conn.close()

    def point(self, name):
        pending = self.directory / "pending"
        pending.symlink_to(name)
        pending.replace(self.directory / "current")

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.stream.close()


def test_shared_lifecycle_tls_reload_and_request_drain(certificates):
    run = Running(certificates)
    try:
        eventually(lambda: run.request()[0] == 200)
        assert json.loads(run.request()[2]) == json.loads(run.request(tls=True)[2])
        assert json.loads(run.request()[2])["pid"] == run.process.pid
        status, headers, _ = run.request(tls=True, path="/identity/")
        assert status == 307 and headers["location"].startswith("https://")
        run.point("two")
        run.process.send_signal(signal.SIGHUP)
        eventually(lambda: "TLS_RELOAD_OK" in run.log.read_text())
        assert run.request(tls=True)[0] == 200
        run.point("bad")
        run.process.send_signal(signal.SIGHUP)
        eventually(lambda: "TLS_RELOAD_FAILED" in run.log.read_text())
        assert run.request(tls=True)[0] == 200
        with concurrent.futures.ThreadPoolExecutor() as pool:
            pending = pool.submit(run.request, True, "/slow")
            eventually(lambda: "request" in run.events.read_text())
            run.process.terminate()
            assert pending.result()[0] == 200
        assert run.process.wait(timeout=10) == 0
        assert run.events.read_text().splitlines() == [
            "startup",
            "request",
            "background-drain",
            "engines-closed",
            "shutdown",
        ]
    finally:
        run.close()


def test_startup_failure_never_serves(certificates):
    run = Running(certificates, FAIL_START="1")
    try:
        assert run.process.wait(timeout=10) != 0
        assert run.events.read_text().splitlines() == ["startup"]
        with pytest.raises(ConnectionRefusedError):
            run.request()
    finally:
        run.close()


def test_ports_reserved_before_lifespan_and_signal_during_startup(certificates):
    run = Running(certificates, START_DELAY="0.7")
    try:
        eventually(lambda: "startup" in run.events.read_text())
        for port in (run.http, run.https):
            with socket.socket() as contender:
                contender.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                with pytest.raises(OSError):
                    contender.bind(("127.0.0.1", port))
        run.process.send_signal(signal.SIGINT)
        assert run.process.wait(timeout=10) == 0
        assert run.events.read_text().splitlines() == [
            "startup",
            "background-drain",
            "engines-closed",
            "shutdown",
        ]
    finally:
        run.close()


def test_failed_bind_prevents_lifespan_and_closes_other_socket(certificates):
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", 0))
        occupied.listen()
        run = Running(certificates, TLS_PORT=str(occupied.getsockname()[1]))
        try:
            assert run.process.wait(timeout=10) != 0
            assert run.events.read_text() == ""
            with pytest.raises(ConnectionRefusedError):
                run.request()
        finally:
            run.close()


def test_mcp_session_crosses_http_and_tls_with_guard_intact(certificates):
    pytest.importorskip("fastmcp")
    run = Running(
        certificates,
        MCP_FIXTURE="1",
        MCP_ALLOWED_HOSTS="localhost:*",
        MCP_CORS_ALLOW_ORIGINS="https://localhost:3443",
    )
    try:
        eventually(lambda: run.request(path="/mcp")[0] in (400, 406))
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "isolated", "version": "1"},
            },
        }
        status, reply, content = run.request(
            path="/mcp", headers=headers, body=json.dumps(initialize)
        )
        assert status == 200, content
        session_id = {key.lower(): value for key, value in reply.items()}["mcp-session-id"]
        headers.update(
            {
                "Mcp-Session-Id": session_id,
                "MCP-Protocol-Version": "2025-03-26",
                "Origin": "https://localhost:3443",
            }
        )
        assert (
            run.request(
                True,
                "/mcp",
                headers,
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": "notifications/initialized",
                    }
                ),
            )[0]
            == 202
        )
        status, _, content = run.request(
            True,
            "/mcp",
            headers,
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/list",
                }
            ),
        )
        assert status == 200 and "ping" in content
        assert run.request(True, "/mcp", {"Host": "evil.invalid"})[0] in (400, 403, 421)
        assert run.request(True, "/mcp", {"Origin": "https://evil.invalid"})[0] in (400, 403)
    finally:
        run.close()


@pytest.mark.skipif(
    not os.getenv("SELFHOST_FRONTEND_BUILD"), reason="requires production frontend build"
)
def test_frontend_production_dual_tls_runtime_config_and_shutdown(certificates):
    build_root = Path(os.environ["SELFHOST_FRONTEND_BUILD"]).resolve()
    ui = certificates / "ui"
    ui.mkdir()
    shutil.copytree(
        build_root / ".next",
        ui / ".next",
        copy_function=os.link,
        ignore=shutil.ignore_patterns("standalone", "cache"),
    )
    (ui / "node_modules").symlink_to(
        Path(os.environ["SELFHOST_FRONTEND_MODULES"]), target_is_directory=True
    )
    (ui / "public").symlink_to(build_root / "public", target_is_directory=True)
    shutil.copyfile(build_root / "server.cjs", ui / "native-server.cjs")
    run = Running.__new__(Running)
    run.directory = certificates
    run.http, run.https = free_port(), free_port()
    run.log = certificates / "frontend.log"
    run.stream = run.log.open("w")
    env = dict(
        os.environ,
        NODE_ENV="production",
        NEXT_TELEMETRY_DISABLED="1",
        BIND_ADDRESS="127.0.0.1",
        PORT=str(run.http),
        TLS_PORT=str(run.https),
        TLS_DIRECTORY=str(certificates / "current"),
        COGNEE_BACKEND_URL="https://configured.example.test:8443",
        DRAIN_SECONDS="5",
    )
    run.process = subprocess.Popen(
        ["node", "native-server.cjs"], cwd=ui, env=env, stdout=run.stream, stderr=run.stream
    )
    try:
        eventually(lambda: run.request(path="/api/runtime-config")[0] == 200)
        first = run.request(path="/api/runtime-config")
        second = run.request(True, "/api/runtime-config")
        assert first[0] == second[0] == 200
        assert (
            json.loads(first[2])
            == json.loads(second[2])
            == {
                "backendUrl": "https://configured.example.test:8443",
            }
        )
        assert run.request(True, "/local-login")[0] == 200
        run.point("two")
        run.process.send_signal(signal.SIGHUP)
        eventually(lambda: "TLS_RELOAD_OK" in run.log.read_text())
        assert run.request(True, "/api/runtime-config")[0] == 200
        run.point("bad")
        run.process.send_signal(signal.SIGHUP)
        eventually(lambda: "TLS_RELOAD_FAILED" in run.log.read_text())
        assert run.request(True, "/api/runtime-config")[0] == 200
        run.process.terminate()
        assert run.process.wait(timeout=10) == 0
    finally:
        run.close()
