# Independent maintenance review

> **Policy update, 2026-10-31:** upstream Memos database compatibility is no longer supported. The migration discussion below records the earlier 2026-10-30 review, not the current support policy. Use the current [README](../README.md#migrating-from-upstream-memos) and [CI guide](ci.md); CI now verifies fresh Plus databases and restart persistence.

[English README](../README.md) · [中文 README](../README_zh.md)

Reviewed on **2026-10-30**, starting from local `main` at `8ee47d07005eaab3972ae39f98bb905f97558b78`. This records a documentation and release-packaging review, not a release, migration certification, or complete dependency-license audit.

## English documentation

The full standalone English guide is now the default `README.md`; the Chinese guide is `README_zh.md`. English appears first in both language-switch links. They cover project scope and upstream attribution, implemented features, the maintainer-provided demo, Docker/Compose/native deployment, ports and persistence, configuration, blog import, styles, backups and recovery, upstream migration limits, source builds, development, feedback, and licensing.

Important corrections shared by both guides:

- Native startup defaults to port `8081`; the Dockerfile sets `5230` in the container.
- Compose paths are relative to the Compose file: the maintained checkout example uses `deploy/data`, while a downloaded standalone example uses its adjacent `data` directory.
- Blog import is under Space settings, with a separate main-site entry for instance administrators.
- Historical releases have raw binaries; the six-target archive matrix describes the current workflow, not already available assets.
- A configured GHCR workflow does not prove that an image/tag is published or publicly pullable. Source-build instructions provide an alternative.
- The upstream schema target is `0.34.1`, separate from the Plus release version. Older databases are not declared universally compatible; staging and a restorable pre-upgrade backup are required.
- Markdown exports alone do not restore all application state. SQLite snapshots contain sensitive database contents; external database/object storage backups remain separate responsibilities.

The README no longer includes an inactive placeholder for a nonexistent screenshot. The existing logo and maintainer-provided demo are used; demo availability was not established by this review.

## Maintenance and distribution changes

| Files | Purpose |
| --- | --- |
| `README.md`, `README_zh.md` | Full bilingual entry points and verified operational guidance. |
| `deploy/demo.md`, `docs/configuration-provisioning.md` | Add English/Chinese project-guide navigation. |
| `CODEOWNERS` | Replace the upstream default team with `@3035936740`; there were no finer-grained rules to preserve. |
| `SECURITY.md` | Scope the policy to Plus, remove the upstream contact and unsupported version-policy assumptions, and document the missing verified private channel. |
| `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` | Route project reports/docs to Plus, distinguish Plus and upstream schema versions, and keep vulnerability details out of public reports. |
| `web/src/pages/About.tsx`, `web/src/components/PoweredByMemosPlus.tsx`, `web/tests/about-page.test.tsx` | Correct the project repository address and corresponding link expectations; retain upstream attribution links. |
| `example/stylepacks/dreamcore/style.json`, `example/stylepacks/skeuomorphism/style.json` | Correct the examples' project homepage URLs. |
| `scripts/compose.yaml` | Replace the upstream runtime image with the Plus image and use `~/.memos-plus/`, retaining the existing service/container name. Existing deployments must explicitly map their old data path before switching examples. |
| `scripts/package_release.py`, `scripts/test_package_release.py`, `.github/workflows/release.yml` | Package all six existing targets with the complete root `LICENSE` and bundled visual notices, preserving artifact naming and root-level executable names. Tests inspect archive contents and permissions. |
| `scripts/Dockerfile` | Copy the complete license and bundled notices from the actual backend stage into `/usr/local/memos/` in the final runtime stage. Root build context and the prebuilt frontend are still required. |
| `scripts/plus_workflows_test.go` | Include the alternate Compose example and updated issue templates in existing YAML checks. |
| `.github/workflows/backend-tests.yml` | Stage `web/public/site.webmanifest` for backend tests; a clean checkout otherwise embeds only the tracked HTML stub. |
| `server/router/frontend/webapp_test.go` | Check type assertions in the existing manifest test, addressing the precise lint failure. |
| `web/src/layouts/RootLayout.tsx`, `web/src/themes/memo-pick.css`, `oddities.css`, `settings-surfaces.css` | Apply only import ordering/formatting fixes identified in current CI logs; no UI behavior changes. |
| `docs/independent-maintenance-review.md` | Record evidence, validation limits, and remaining maintainer work. |

The root `LICENSE` remains unchanged, including `Copyright (c) 2025 Memos` and its complete MIT text. Existing third-party notices and upstream source links are retained. `.github/FUNDING.yml` still names upstream `usememos`; this review does not establish a new Plus sponsorship channel.

## Validation performed

Commands were run from the repository root unless noted. Temporary archives were removed after inspection; nothing was published.

| Check / command | Actual result |
| --- | --- |
| `python -B scripts/test_package_release.py` | Passed: three tests, including all six current release OS/architecture branches, exact license/notice bytes, executable preservation, missing input, and invalid artifact path rejection. These use fixture binaries, not six newly compiled executables. |
| Temporary archive inspection using `package_binary(...)` with existing `bin/memos-windows-x64.exe` and `bin/memos-linux-amd64` | Passed: actual ZIP/tar.gz contained the unchanged executable, complete `LICENSE`, and `visual-effects-NOTICES.txt`; executable hashes and license bytes matched their inputs. Existing binaries were not rebuilt or treated as release candidates. |
| `go test ./scripts -count=1` | Passed: existing workflow/Compose YAML checks, expanded to the modified examples/templates. |
| `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 -shellcheck= -pyflakes= <all .github/workflows/*.yml paths>` | Passed. Final rerun used cached modules with `GOPROXY=off` and `GOSUMDB=off` after an online retry timed out checking GitHub. No repository dependencies changed. ShellCheck/Pyflakes were not available/enabled. |
| `pnpm lint` in `web` | Passed after the focused formatting changes: TypeScript and Biome checked 849 files. |
| `pnpm exec vitest run tests/about-page.test.tsx` in `web` | Passed: eight existing tests with corrected project links. |
| `DRIVER=sqlite go test ./server/router/frontend -run 'TestWebAppManifestFollowsSavedBrand\|TestWebAppMetadataEscapesTitleAndChangesManifestRevision' -count=1` | Passed with local prebuilt assets. PowerShell used `$env:DRIVER='sqlite'`. The local manifest was verified identical to the source now staged in CI. |
| Git Bash `bash -n scripts/entrypoint.sh` and `bash -n scripts/release_smoke_test.sh` | Passed shell syntax checks; the Docker upgrade smoke itself was not run. |
| Git Bash `bash scripts/entrypoint_test.sh` | **Failed locally:** four passed, one failed because a file made unreadable with POSIX permissions remained readable in this Windows environment. The same entrypoint job passed in the inspected Linux Actions run. No test was removed or bypassed. |
| Inline Python UTF-8, local-link/heading-anchor/image-path and code-fence checks | Passed for the two READMEs, security policy, demo guide, provisioning guide, and this review: 51 local links, no missing target/anchor or trailing whitespace. The two updated style-pack examples also parse as JSON. This is not a remote-URL uptime check. |
| Dockerfile/context inspection | License and notice source paths exist; the prebuilt notice matches `web/public/visual-effects-NOTICES.txt`. `.dockerignore` excludes `web/`, so the final notice correctly comes from the prebuilt frontend. Final image contents were **not** inspected. |
| `git diff --check` on this task's files; LICENSE comparison with `git show HEAD:LICENSE` | Passed, with Git line-ending normalization accounted for. No DB schema, migration, protocol, Go module, or dependency lockfile changes. |

Docker is unavailable on this PC. No final image build, anonymous GHCR pull, Docker Compose runtime validation, fresh installation, full release build, database upgrade, MySQL/PostgreSQL test, or production test was performed. No full Go/frontend test suite or full golangci-lint rerun is claimed. Do not interpret fixture packaging tests as migration safety or platform runtime certification.

## Current Actions evidence and remaining release blockers

The following runs were fetched from the **new repository**, all for `8ee47d07005eaab3972ae39f98bb905f97558b78`. These are remote results before the local changes above, not a rerun of this uncommitted work.

- [Backend Tests, run 41065135919](https://github.com/3035936740/memos-plus/actions/runs/41065135919): static lint reported an unchecked manifest-test type assertion. Tests also reported a missing embedded manifest, a storage-path normalization test/implementation mismatch, and MinIO image pulls denied for `minio/minio:RELEASE.2024-01-16T16-07-38Z`. The assertion and missing manifest preparation are addressed locally. Resolve the storage contract separately and select/verify a working S3 test-service image; do not disable those tests.
- [Frontend Tests, run 41065135720](https://github.com/3035936740/memos-plus/actions/runs/41065135720): frontend build passed; lint failed on four import/formatting diagnostics, so unit tests in that job were skipped. The four diagnostics are corrected locally and local lint passes. Only the targeted About tests were run locally.
- [Upgrade Smoke, run 41065135659](https://github.com/3035936740/memos-plus/actions/runs/41065135659): the inspected SQLite migration log was blocked by the same MinIO pull. The release-image smoke log failed to pull `neosmemo/memos:0.34.1` (`not found`). The script chooses that image from the schema target, not from the preceding Plus release tag. A schema version is not proof that a matching registry tag exists. Choose and verify an actual migration-source image/digest before rerunning all three drivers. No replacement version was guessed and no upgrade gate was skipped.
- [Build Canary Image, run 41065135803](https://github.com/3035936740/memos-plus/actions/runs/41065135803): prerequisite checks failed; image build/merge/public-image verification were skipped. This does not establish an available canary image.
- [Proto Linter, run 41065135622](https://github.com/3035936740/memos-plus/actions/runs/41065135622): lint passed, but `buf format -d` detected formatting differences. The log does not identify the affected files because it captures the diff in a shell condition. Review a local Buf formatting diff separately; no protocol/generated files were changed here.

These logs do not establish that detaching the fork caused the failures. Release gates remain intact: no tests were deleted, no `continue-on-error` was added, and no upgrade verification was bypassed. Run the updated checks in Actions before making a release.

## Maintainer actions

No GitHub repository settings were changed.

1. **Required:** establish and test a private vulnerability-reporting channel. Enable GitHub private vulnerability reporting or provide another verified private channel; then update `SECURITY.md`. No verified private channel could be confirmed in this review.
2. **Recommended:** enable Issues if this repository should accept normal bug reports and feature requests. GitHub repository metadata reported `has_issues: false`; the corrected templates take effect only after Issues is enabled.
3. Before publishing containers, verify the intended GHCR package visibility and anonymous pullability. This review did not change package settings or publish an image.
4. Optional local housekeeping: `origin` still points to `https://github.com/3035936740/memos.git`. After checking local tooling, the maintainer can change it to `https://github.com/3035936740/memos-plus.git`. The remote was not changed automatically.

The pre-existing working-tree changes to daily-question/editor/Home code, the embedded HTML, and `docs/style-packs-and-import-api.md` were left untouched. The last file contains an old repository name inside the user's task description; it is not an active project link to mechanically rewrite. Nothing was staged, committed, pushed, tagged, or released.

Suggested commit groups, for the maintainer to create:

1. `docs: add complete English README and independent maintenance guidance`
2. `build: include licenses and notices in release archives and images`
3. `chore: correct Plus maintenance links and focused CI checks`
