# Memos Plus CI and database support

[English README](../README.en.md) · [中文 README](../README.md)

## Database boundary

As of **2026-10-31**, directly opening or upgrading any **upstream Memos database is unsupported**. New installations must use empty databases and separate data directories. Retained upstream module names, schema version files, and historical migration sources do not imply compatibility.

CI verifies the current Plus application on freshly initialized SQLite, MySQL, and PostgreSQL databases, including persistence across a restart of the same candidate image. It does not certify arbitrary old Plus releases either. Supported content import formats are separate from database compatibility.

## Workflow structure

| File | Responsibility |
| --- | --- |
| [ci.yml](../.github/workflows/ci.yml) | Shared gate. Runs on PRs and manual dispatch; main pushes invoke it through Canary, and release tags through Release. Requires every child check to succeed. |
| [backend-tests.yml](../.github/workflows/backend-tests.yml) | Tidy/lint, packaging/license checks, current application tests with SQLite and real S3, SQLite race checks, and current store tests on fresh MySQL/PostgreSQL databases. |
| [frontend-tests.yml](../.github/workflows/frontend-tests.yml) | Frozen pnpm installation, TypeScript/Biome, existing unit tests, and production embedded frontend build. Uploads the checked frontend once. |
| [proto-linter.yml](../.github/workflows/proto-linter.yml) | Lint and formatting for `proto` only; prints the formatting diff. Does not scan developer caches, other worktrees, or vendored dependency downloads. |
| [fresh-install.yml](../.github/workflows/fresh-install.yml) | Builds the actual runtime image once, then checks empty databases, first administrator creation, login, writing/reading, restart persistence, frontend assets, full LICENSE and third-party notices for all three database drivers. Also runs entrypoint checks on Linux. |
| [build-canary-image.yml](../.github/workflows/build-canary-image.yml), [release.yml](../.github/workflows/release.yml) | Keep existing image/archive platforms and publication behavior, but require the same current-Plus gate. Reuse its frontend artifact. No upstream database is seeded or upgraded. |

The former `upgrade-smoke.yml` has been replaced. Backend/frontend/protocol workflows are reusable or manually invoked rather than creating duplicate automatic checks for the same event. This does not publish anything from a pull request.

If branch protection names old workflow checks, the maintainer must select the new `checks-passed` gate after its first verified run. This change does not modify repository settings or branch protection automatically.

## Historical tests and current checks

[ci-unsupported-upstream-tests.txt](../scripts/ci-unsupported-upstream-tests.txt) contains **exact names** of 15 historical upstream/legacy database conversion tests that no longer belong to the support policy. Sources are retained and still compile. This is not a blanket `TestMigration*` exclusion: fresh installation, same-schema reruns, data preservation on restart, downgrade refusal, Plus CRUD, permissions, trash/history, and S3 checks remain required.

[ci_go_tests.sh](../scripts/ci_go_tests.sh) applies this explicit boundary. The policy test checks that each retired test still exists and that important current-database tests cannot accidentally enter the retired list. New tests are included by default. No `continue-on-error`, global container-test skip, or automatic success fallback is used in the required workflows.

## S3 test service

The previously pinned Docker Hub MinIO image was unavailable in inspected Actions logs. The old Docker Hub tag and the corresponding public Quay pull could not be verified as available during this change. CI therefore builds the **same S3 test-service version** from verified MinIO source commit [`ca258c04cb1dea33c31fed86250eaa3d1f020ff8`](https://github.com/minio/minio/commit/ca258c04cb1dea33c31fed86250eaa3d1f020ff8), using [build_ci_minio.sh](../scripts/build_ci_minio.sh) and [ci-minio.Dockerfile](../scripts/ci-minio.Dockerfile).

`MEMOS_TEST_MINIO_IMAGE=memos-plus-ci-minio:local` selects that local image for existing integration tests. Its own license is copied into the temporary service image. The service image is never included in the application or published. A failed source download/build or S3 test fails the gate; it does not silently disable integration coverage. This temporary source build does not change the application's Go dependencies.

## Local checks

Use Go 1.26.2, Node 24, and pnpm 11.0.1 as pinned by the repository.

For an environment without Docker, the supported SQLite checks can run in short mode. Container integrations are not verified by this command:

```bash
DRIVER=sqlite bash scripts/ci_go_tests.sh -short -count=1 ./...
```

For the full Linux/Docker application checks including S3:

```bash
bash scripts/build_ci_minio.sh
DRIVER=sqlite MEMOS_TEST_MINIO_IMAGE=memos-plus-ci-minio:local \
  bash scripts/ci_go_tests.sh -count=1 ./...
DRIVER=mysql bash scripts/ci_go_tests.sh -count=1 ./store/...
DRIVER=postgres bash scripts/ci_go_tests.sh -count=1 ./store/...
```

Other focused commands:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web build
python3 -B scripts/test_package_release.py
buf lint proto
buf format proto --diff --exit-code
bash scripts/release_smoke_test.sh --candidate-image memos-plus-ci:current
```

The last command needs an existing candidate image; set `MEMOS_SMOKE_DRIVER` to `sqlite`, `mysql`, or `postgres`. Without `--candidate-image`, the script builds the frontend and current image locally. Each run creates isolated disposable data and removes its own resources by default. There is no `--previous-image` option or upstream-image download.

On Windows, use Git Bash for shell commands. The Docker service image and fresh-install tests are Linux CI checks. A successful local short-mode run does not establish that Docker, S3, external SQL, architecture-specific images, or remote Actions have passed. The work must be committed and pushed by the maintainer before the rewritten workflows can run remotely.

## Validation of this change

Local checks passed for the supported SQLite short-mode suite, focused full frontend-router Go tests (including branded 503 responses), golangci-lint, frontend TypeScript/Biome and production compilation, release packaging/license tests, workflow validation with actionlint, shell syntax, owned Proto lint/format, and documentation links. Protocol formatting preserves all non-whitespace content; no schema or migration files were changed.

Docker is unavailable on the development PC. The pinned MinIO source commit was verified and downloaded, but its separate compilation stalled while downloading dependencies and was stopped; that build is **not** recorded as passed. The CI step has an explicit timeout and fails on build problems. S3 containers, MySQL/PostgreSQL runtime tests, fresh-image smoke tests, and the remote workflow graph still require an actual GitHub run. No push, tag, release, or repository setting change was made during this work.
