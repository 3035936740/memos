# Store tests

## Current support policy (2026-10-31)

Memos Plus does not support opening or upgrading upstream Memos databases. Current CI checks fresh Plus databases and restart persistence. Historical migration fixtures remain for reference and compilation; they do not establish a supported upgrade path. See [the CI guide](../../docs/ci.md) and the exact [retired test list](../../scripts/ci-unsupported-upstream-tests.txt).

Run commands from the repository root with Go 1.26.2. Use Bash (Git Bash on Windows) for the wrapper:

```bash
DRIVER=sqlite bash scripts/ci_go_tests.sh -short -count=1 ./store/...
DRIVER=mysql bash scripts/ci_go_tests.sh -count=1 ./store/...
DRIVER=postgres bash scripts/ci_go_tests.sh -count=1 ./store/...
```

SQLite tests create temporary local databases. MySQL/PostgreSQL tests require Docker and start their own test containers, creating an isolated database per test. They do not need an existing production database or a manually supplied DSN. Never point test fixtures at production data.

The wrapper excludes only explicitly retired upstream/legacy conversion tests. Current CRUD, permissions, Plus features, fresh schemas, same-schema reruns, and downgrade protection remain in scope. A raw `go test` can still select retained historical fixtures; their existence or outcome is not a compatibility promise.
