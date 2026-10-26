"""Linux lifecycle regression checks; no Docker, npm install or Codespaces needed."""
import hashlib
import json
import copy
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


def recovery_fixture(root, repo):
    """Fixture CLI records every mutation; no real Docker objects are touched."""
    docker = repo / "bin/docker"
    docker.parent.mkdir(parents=True, exist_ok=True)
    docker.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ['TEST_ROOT'])
fixture = json.loads((root / 'docker-fixture.json').read_text())
args = sys.argv[1:]
with (root / 'docker-calls.jsonl').open('a') as log:
    log.write(json.dumps(args) + '\\n')
if args == ['info']:
    sys.exit(0)
if args[:2] == ['compose', 'up']:
    counter = root / 'up-count'
    index = int(counter.read_text()) if counter.exists() else 0
    counter.write_text(str(index + 1))
    codes = fixture['up_exits']
    code = codes[min(index, len(codes) - 1)]
    if code:
        print('OCI runtime create failed: runc create failed: container with given ID already exists', file=sys.stderr)
    sys.exit(code)
if args[:2] == ['compose', 'config']:
    print(json.dumps(fixture['config']))
elif args[:2] == ['compose', 'ps']:
    print(fixture['ids'])
elif args[0] == 'inspect':
    if fixture.get('inspect_exit'):
        sys.exit(fixture['inspect_exit'])
    print(fixture.get('raw_inspect', json.dumps(fixture['container'])))
elif args[:2] == ['volume', 'inspect']:
    if fixture.get('volume_exit'):
        sys.exit(fixture['volume_exit'])
    print(json.dumps(fixture['volume_name']))
elif args == ['rm', fixture['container']['Id']]:
    sys.exit(fixture.get('rm_exit', 0))
else:
    raise SystemExit('Unexpected docker invocation: ' + repr(args))
''')
    docker.chmod(0o700)
    volume = "fixture-preview_postgres-data"
    return {
        "up_exits": [31, 0], "ids": "a" * 64, "volume_name": volume,
        "config": {"name": "fixture-preview", "volumes": {"postgres-data": {"name": volume}},
                   "services": {"postgres": {"image": "postgres:18", "volumes": [
                       {"source": "postgres-data", "target": "/var/lib/postgresql", "type": "volume"}]}}},
        "container": {"Id": "a" * 64, "Image": "postgres:18",
                      "State": {"Status": "exited", "Running": False, "ExitCode": 128, "Dead": False,
                                "Error": "OCI runtime create failed: runc create failed: container with given ID already exists"},
                      "Labels": {"com.docker.compose.project": "fixture-preview",
                                 "com.docker.compose.service": "postgres",
                                 "com.docker.compose.project.working_dir": str(repo.resolve()),
                                 "com.docker.compose.project.config_files": str(repo.resolve() / "compose.yaml")},
                      "Mounts": [{"Type": "volume", "Name": volume, "RW": True,
                                  "Destination": "/var/lib/postgresql"}]}}


def docker_calls(root):
    path = root / "docker-calls.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


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
        for name in ("start.sh", "status-server.mjs", "recover-postgres.mjs"):
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
        self.assertIn("startup finished: exit=0", (self.state / "startup.log").read_text())
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
        self.assertIn("startup finished: exit=31", log)
        self.assertNotIn("startup finished: exit=0", log)

    def collision_start(self, **overrides):
        fixture = recovery_fixture(self.root, self.repo)
        fixture.update(overrides)
        (self.root / "docker-fixture.json").write_text(json.dumps(fixture))
        return self.start()

    def assert_recovery_calls(self, starts, removals):
        calls = docker_calls(self.root)
        self.assertEqual(sum(call[:2] == ["compose", "up"] for call in calls), starts)
        self.assertEqual([call for call in calls if call[0] == "rm"], [["rm", "a" * 64]] * removals)
        self.assertFalse(any(call[:2] == ["volume", "rm"] or "down" in call for call in calls))

    def test_oci_collision_recovers_once(self):
        output = self.result(self.collision_start())
        self.assert_recovery_calls(starts=2, removals=1)
        self.assertIn("preserving volume=fixture-preview_postgres-data", output)
        self.assertIn("startup finished: exit=0", output)
        self.assertTrue(all(responds(p) for p in (5173, 5174, 8080)))

    def test_oci_retry_failure_is_final(self):
        output = self.result(self.collision_start(up_exits=[31, 47]), 47)
        self.assert_recovery_calls(starts=2, removals=1)
        self.assertIn("startup finished: exit=47", output)
        self.assertNotIn("startup finished: exit=0", output)
        self.assertTrue(responds(5173) and responds(5174))

    def test_oci_remove_failure_does_not_retry(self):
        output = self.result(self.collision_start(rm_exit=17), 31)
        self.assert_recovery_calls(starts=1, removals=1)
        self.assertIn("startup finished: exit=31", output)
        self.assertTrue(responds(5173) and responds(5174))

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
        self.assertIn("startup finished: exit=1", output)
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


class RecoveryGuardTest(unittest.TestCase):
    def test_refuses_unsafe_or_unrelated_containers_without_mutation(self):
        with tempfile.TemporaryDirectory(prefix="postgres recovery ") as temp:
            root = Path(temp)
            repo = root / "repo"
            fixture = recovery_fixture(root, repo)
            env = dict(os.environ, TEST_ROOT=str(root), PATH=f"{repo}/bin:{os.environ['PATH']}")
            changes = [
                (("ids",), ""), (("ids",), "a" * 64 + "\n" + "b" * 64),
                (("ids",), "postgres-name"), (("container", "Id"), "b" * 64),
                (("container", "State", "Status"), "running"),
                (("container", "State", "Running"), True),
                (("container", "State", "ExitCode"), 255),
                (("container", "State", "Dead"), True),
                (("container", "State", "Error"), ""),
                (("container", "State", "Error"), "unhealthy PostgreSQL"),
                (("container", "State", "Error"), "container with given ID already exists"),
                (("container", "Labels", "com.docker.compose.project"), "foreign-project"),
                (("container", "Labels", "com.docker.compose.service"), "backend"),
                (("container", "Labels", "com.docker.compose.project.working_dir"), "/other/repo"),
                (("container", "Labels", "com.docker.compose.project.config_files"), "/other/compose.yaml"),
                (("container", "Image"), "other:18"),
                (("container", "Mounts"), []),
                (("container", "Mounts", 0, "Type"), "bind"),
                (("container", "Mounts", 0, "Name"), "anonymous-volume"),
                (("container", "Mounts", 0, "RW"), False),
                (("volume_name",), "foreign-volume"), (("volume_exit",), 17),
                (("config", "services", "postgres", "image"), "other:18"),
                (("config", "services", "postgres", "volumes", 0, "source"), "other-data"),
                (("config", "volumes"), {}),
                (("inspect_exit",), 17), (("raw_inspect",), "invalid json"),
            ]
            for keys, value in changes:
                with self.subTest(field=keys, value=value):
                    changed = copy.deepcopy(fixture)
                    target = changed
                    for key in keys[:-1]:
                        target = target[key]
                    target[keys[-1]] = value
                    (root / "docker-fixture.json").write_text(json.dumps(changed))
                    (root / "docker-calls.jsonl").write_text("")
                    result = subprocess.run(["node", str(SOURCE / "recover-postgres.mjs")],
                                            cwd=repo, env=env, capture_output=True, text=True, timeout=5)
                    self.assertNotEqual(result.returncode, 0, result.stdout)
                    calls = docker_calls(root)
                    self.assertFalse(any(call[0] == "rm" or call[:2] == ["compose", "up"] or
                                         call[:2] == ["volume", "rm"] for call in calls))


if __name__ == "__main__":
    unittest.main(verbosity=2)
