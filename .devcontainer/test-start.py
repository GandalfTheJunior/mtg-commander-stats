"""Linux lifecycle regression checks; no Docker, npm install or Codespaces needed."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request


SOURCE = Path(__file__).resolve().parent


def eventually(check, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.05)
    raise AssertionError("Timed out waiting for condition")


def responds(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


class StartupTest(unittest.TestCase):
    def setUp(self):
        for port in (5173, 5174, 8080):
            self.assertFalse(responds(port), f"Test requires unused port {port}")
        self.temp = tempfile.TemporaryDirectory(prefix="preview lifecycle ")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.state = self.root / "home/.local/state/mtg-commander-stats"
        self.state.mkdir(parents=True)
        for name in (".devcontainer", "frontend/node_modules/.bin", "backend", "bin"):
            (self.repo / name).mkdir(parents=True)
        for name in ("start.sh", "status-server.mjs"):
            (self.repo / ".devcontainer" / name).write_bytes((SOURCE / name).read_bytes())
        lock = b"fixture lockfile"
        (self.repo / "frontend/package-lock.json").write_bytes(lock)
        (self.state / "frontend-lock.sha256").write_text(hashlib.sha256(lock).hexdigest())
        (self.repo / "frontend/node_modules/.bin/vite").touch()
        # Real Node HTTP processes, with npm/Docker/Maven replaced at their boundaries.
        (self.repo / "server.mjs").write_text(
            "import {createServer} from 'node:http';\n"
            "setTimeout(() => createServer((q,s) => s.end('ok')).listen("
            "Number(process.argv[2]), '127.0.0.1'), 500);\n")
        self.script("bin/npm", 'if [ "$1" = ci ]; then echo ci >> "$TEST_ROOT/installs"; exit; fi\n'
                    'exec node "$TEST_REPO/server.mjs" 5173')
        self.script("bin/docker", 'if [ "$1" = info ]; then exit 0; fi\n'
                    'while [ -f "$TEST_ROOT/hold" ]; do sleep 0.05; done\n'
                    'if [ -f "$TEST_ROOT/fail-db" ]; then echo "fixture DB failure" >&2; exit 31; fi')
        self.script("backend/mvnw", 'exec node "$TEST_REPO/server.mjs" 8080')
        self.env = dict(os.environ, HOME=str(self.root / "home"),
                        CODESPACE_NAME="lifecycle-test", TEST_ROOT=str(self.root),
                        TEST_REPO=str(self.repo), PATH=f"{self.repo}/bin:{os.environ['PATH']}")
        self.calls = []

    def script(self, name, body):
        path = self.repo / name
        path.write_text("#!/bin/bash\nset -eu\n" + body + "\n")
        path.chmod(0o700)

    def start(self):
        process = subprocess.Popen(["bash", ".devcontainer/start.sh"], cwd=self.repo,
                                   env=self.env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        self.calls.append(process)
        return process

    def result(self, process, expected=0):
        output, _ = process.communicate(timeout=20)
        self.assertEqual(process.returncode, expected, output.decode())
        return output.decode()

    def pids(self):
        return {p.stem: int(p.read_text()) for p in self.state.glob("*.pid")}

    def stop_services(self):
        for pid in self.pids().values():
            try:
                os.killpg(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        eventually(lambda: not any(responds(p) for p in (5173, 5174, 8080)))

    def tearDown(self):
        for process in self.calls:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.communicate(timeout=5)
        self.stop_services()
        self.temp.cleanup()

    def test_create_repeat_parallel_and_restart(self):
        # Exercise the install branch on first creation.
        (self.state / "frontend-lock.sha256").unlink()
        first, second = self.start(), self.start()
        self.result(first)
        self.result(second)
        before = self.pids()
        self.assertEqual(len(before), 3)
        self.assertEqual((self.root / "installs").read_text(), "ci\n")
        self.result(self.start())
        self.assertEqual(self.pids(), before)
        for pid in before.values():
            self.assertEqual(os.getsid(pid), pid)
            self.assertEqual(os.getpgid(pid), pid)
            lock_fd = Path(f"/proc/{pid}/fd/9")
            self.assertFalse(lock_fd.exists() and lock_fd.samefile(self.state / "startup.lock"))
        self.stop_services()  # Leave stale PID files, like a container restart.
        self.result(self.start())
        self.assertTrue(all(self.pids()[name] != pid for name, pid in before.items()))
        self.assertTrue(all(responds(p) for p in (5173, 5174, 8080)))

    def test_db_failure_keeps_status_and_frontend(self):
        (self.root / "fail-db").touch()
        self.result(self.start(), 31)
        self.assertTrue(responds(5173))
        self.assertTrue(responds(5174))
        self.assertFalse(responds(8080))
        log = (self.state / "startup.log").read_text()
        self.assertIn("exit=31", log)
        self.assertIn("fixture DB failure", log)
        self.assertIn("stdin_tty=no", log)

    def test_slow_backend_is_reused_before_readiness(self):
        self.script("bin/sleep", 'exec /bin/sleep 0.01')
        self.script("backend/mvnw", 'while [ ! -f "$TEST_ROOT/backend-release" ]; do /bin/sleep 0.05; done\n'
                    'exec node "$TEST_REPO/server.mjs" 8080')
        self.assertIn("readiness timed out", self.result(self.start(), 1))
        before = self.pids()
        retry = self.start()
        eventually(lambda: "backend: reusing running pid=" in (self.state / "startup.log").read_text())
        (self.root / "backend-release").touch()
        self.result(retry)
        self.assertEqual(self.pids(), before)

    def test_lifecycle_group_signals_do_not_stop_services(self):
        (self.root / "hold").touch()
        process = self.start()
        eventually(lambda: responds(5173) and responds(5174))
        os.killpg(process.pid, signal.SIGHUP)
        process.communicate(timeout=5)
        # Also send TERM to the former lifecycle group (e.g. runner cleanup).
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        self.assertTrue(responds(5173))
        self.assertTrue(responds(5174))
        before = self.pids()
        (self.root / "hold").unlink()
        self.result(self.start())
        self.assertEqual({k: self.pids()[k] for k in before}, before)

    def test_early_child_exit_is_logged(self):
        self.script("bin/node", '[ "$1" = --version ] && exit 0\nexit 42')
        output = self.result(self.start(), 1)
        self.assertIn("wait_exit=42", output)
        self.assertIn("phase=Statusseite wird gestartet", output)
        self.assertIn("launching status-server", (self.state / "status-server.log").read_text())
        self.assertFalse(responds(5174))

    def test_port_configuration(self):
        config = json.loads((SOURCE / "devcontainer.json").read_text())
        self.assertEqual(config["postStartCommand"], "bash .devcontainer/start.sh")
        self.assertEqual(config["forwardPorts"], [5173, 5174])
        for port in ("5173", "5174"):
            self.assertEqual(config["portsAttributes"][port]["protocol"], "http")
        for port in ("8080", "5432"):
            self.assertEqual(config["portsAttributes"][port]["onAutoForward"], "ignore")
        self.assertNotIn('"public"', json.dumps(config))


if __name__ == "__main__":
    unittest.main(verbosity=2)
