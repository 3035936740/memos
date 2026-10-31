"""Regression checks for the image verifier without requiring Docker."""
import contextlib
import http.client
import io
import json
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

import resource_benchmark


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.response = MagicMock()
        self.response.__enter__.return_value.status = 200
        self.clock = patch.object(resource_benchmark.time, "monotonic", side_effect=lambda: self.now)
        self.sleep = patch.object(resource_benchmark.time, "sleep", side_effect=self.advance)
        self.clock.start()
        self.sleep.start()
        self.addCleanup(self.clock.stop)
        self.addCleanup(self.sleep.stop)

    def advance(self, seconds):
        self.now += seconds

    def test_retries_startup_connection_errors_and_http_errors(self):
        failures = [
            ConnectionResetError(104, "Connection reset by peer"),
            http.client.RemoteDisconnected("Remote end closed connection"),
            urllib.error.URLError(ConnectionRefusedError()),
            TimeoutError("timed out"),
            urllib.error.HTTPError("http://localhost/healthz", 503, "Starting", {}, None),
        ]
        with patch.object(resource_benchmark.urllib.request, "urlopen", side_effect=[*failures, self.response]) as opened:
            resource_benchmark.wait_for_ready("http://localhost", timeout=10)
        self.assertEqual(opened.call_count, len(failures) + 1)
        self.assertEqual(self.now, len(failures))
        self.response.__exit__.assert_called_once()

    def test_accepts_plain_text_health_response_without_json_parsing(self):
        with patch.object(resource_benchmark.urllib.request, "urlopen", return_value=self.response) as opened:
            resource_benchmark.wait_for_ready("http://localhost")
        opened.assert_called_once_with("http://localhost/healthz", timeout=2)
        self.response.__enter__.return_value.read.assert_not_called()
        self.assertEqual(self.now, 0)

    def test_permanent_failure_is_bounded_and_retains_the_cause(self):
        failure = ConnectionResetError(104, "Connection reset by peer")
        with patch.object(resource_benchmark.urllib.request, "urlopen", side_effect=failure) as opened:
            with self.assertRaisesRegex(RuntimeError, "within 3s.*Connection reset") as raised:
                resource_benchmark.wait_for_ready("http://localhost", timeout=3)
        self.assertIs(raised.exception.__cause__, failure)
        self.assertEqual(opened.call_count, 3)
        self.assertEqual(self.now, 3)


class FailureDiagnosticsTests(unittest.TestCase):
    def test_failed_startup_records_state_and_logs_then_removes_container(self):
        output, errors = io.StringIO(), io.StringIO()
        with (
            patch.object(resource_benchmark, "docker", side_effect=["container-id", "127.0.0.1:52301", '{"ExitCode":1}', "startup failed"]) as docker,
            patch.object(resource_benchmark, "wait_for_ready", side_effect=RuntimeError("startup timeout")),
            patch.object(resource_benchmark.subprocess, "run") as cleanup,
            contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors),
        ):
            with self.assertRaisesRegex(RuntimeError, "startup timeout"):
                resource_benchmark.run("test-image")
        result = json.loads(output.getvalue())
        self.assertEqual(result["error"], "startup timeout")
        self.assertEqual(result["containerState"], '{"ExitCode":1}')
        self.assertEqual(result["containerLogs"], "startup failed")
        self.assertEqual(json.loads(errors.getvalue()), result)
        self.assertTrue(docker.call_args_list[-1].kwargs["capture_stderr"])
        container_name = docker.call_args_list[0].args[3]
        self.assertEqual(cleanup.call_args.args[0], ["docker", "rm", "-f", "-v", container_name])


if __name__ == "__main__":
    unittest.main()
