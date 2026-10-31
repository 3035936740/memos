#!/usr/bin/env python3
"""Measure a disposable SQLite container; never touches an existing instance."""
import concurrent.futures
import http.client
import json
import secrets
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request


def docker(*args, capture_stderr=False):
    return subprocess.check_output(["docker", *args], text=True,
                                   stderr=subprocess.STDOUT if capture_stderr else None).strip()


def wait_for_ready(base, timeout=90):
    deadline = time.monotonic() + timeout
    last_error = None
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            # Readiness is an HTTP status check, not a JSON API request.
            # Docker can accept TCP connections before the app starts listening.
            with urllib.request.urlopen(base + "/healthz", timeout=min(2, remaining)) as response:
                if response.status == 200:
                    return
                last_error = RuntimeError(f"healthz returned HTTP {response.status}")
        except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
            last_error = error
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(1, remaining))
    raise RuntimeError(f"container did not become ready within {timeout}s: {last_error}") from last_error


def run(image):
    name = "memos-resource-" + secrets.token_hex(6)
    result = {"image": image, "cpus": 1, "memoryLimitBytes": 1 << 30,
              "driver": "sqlite", "concurrency": 50, "requestsPerEndpoint": 200}
    try:
        docker("run", "-d", "--name", name, "--cpus", "1", "--memory", "1g",
               "-p", "127.0.0.1::5230", "--tmpfs", "/var/opt/memos:rw,size=256m", image)
        mapping = docker("port", name, "5230/tcp")
        base = "http://127.0.0.1:" + mapping.rsplit(":", 1)[1]

        def request(path, data=None, token=None):
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = "Bearer " + token
            req = urllib.request.Request(base + path, headers=headers,
                                         data=None if data is None else json.dumps(data).encode())
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None

        wait_for_ready(base)
        password = secrets.token_hex(16)
        request("/api/v1/users", {"username": "benchmark-admin", "password": password})
        token = request("/api/v1/auth/signin", {"passwordCredentials": {
            "username": "benchmark-admin", "password": password}})["accessToken"]
        memo = request("/api/v1/memos", {"content": "# Benchmark\n\n" + "Reading text. " * 400,
                                        "visibility": "PUBLIC"}, token)
        time.sleep(5)

        def memory():
            # Docker reports memory after subtracting the reclaimable file cache.
            return docker("stats", "--no-stream", "--format", "{{.MemUsage}}", name)

        result["idleMemory"] = memory()
        result["endpoints"] = []
        for endpoint in ["/api/v1/memos?pageSize=10", "/api/v1/" + memo["name"]]:
            def sample(_):
                start = time.monotonic()
                request(endpoint, token=token)
                return (time.monotonic() - start) * 1000
            with concurrent.futures.ThreadPoolExecutor(max_workers=50) as pool:
                started = time.monotonic()
                pending = [pool.submit(sample, i) for i in range(200)]
                memory_samples = []
                while not all(f.done() for f in pending):
                    memory_samples.append(memory())
                latency = sorted(f.result() for f in pending)
            result["endpoints"].append({"path": endpoint, "requests": len(latency),
                                        "elapsedSeconds": time.monotonic() - started,
                                        "p50Ms": statistics.median(latency),
                                        "p95Ms": latency[int(len(latency) * .95) - 1],
                                        "maxMs": max(latency), "memorySamples": memory_samples})
        result["oomKilled"] = docker("inspect", "--format", "{{.State.OOMKilled}}", name) == "true"
        try:
            result["lifetimePeakMemoryBytes"] = int(docker("exec", name, "cat", "/sys/fs/cgroup/memory.peak"))
        except (subprocess.CalledProcessError, ValueError):
            result["lifetimePeakMemoryBytes"] = None
        if result["oomKilled"]:
            raise RuntimeError("container exceeded memory limit")
        print(json.dumps(result, indent=2))
    except Exception as error:
        result["error"] = str(error)
        for field, command in [
            ("containerState", ("inspect", "--format", "{{json .State}}", name)),
            ("containerLogs", ("logs", "--tail", "100", name)),
        ]:
            try:
                result[field] = docker(*command, capture_stderr=True)
            except (OSError, subprocess.CalledProcessError) as diagnostic_error:
                result[field] = str(diagnostic_error)
        # Keep diagnostics in the uploaded artifact as well as the failing job log.
        print(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2), file=sys.stderr)
        raise
    finally:
        subprocess.run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    run(sys.argv[1])
