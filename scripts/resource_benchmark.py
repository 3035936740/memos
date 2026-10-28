#!/usr/bin/env python3
"""Measure a disposable SQLite container; never touches an existing instance."""
import concurrent.futures
import json
import secrets
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


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

        for _ in range(90):
            try:
                request("/healthz")
                break
            except (urllib.error.URLError, json.JSONDecodeError):
                # healthz may return plain text; an HTTP 200 still proves readiness.
                try:
                    with urllib.request.urlopen(base + "/healthz", timeout=2):
                        break
                except urllib.error.URLError:
                    time.sleep(1)
        else:
            raise RuntimeError("container did not start")
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
    finally:
        subprocess.run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    run(sys.argv[1])
