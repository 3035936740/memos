#!/usr/bin/env bash
# Keep the unsupported database boundary explicit and reviewable, not a broad
# TestMigration* exclusion that could silently hide new fresh-install checks.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
names=()
while IFS= read -r name || [[ -n "$name" ]]; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ "$name" =~ ^Test[A-Za-z0-9_]+$ ]] || { echo "Invalid unsupported test name" >&2; exit 1; }
  names+=("$name")
done < "$root/scripts/ci-unsupported-upstream-tests.txt"
skip="^($(IFS='|'; echo "${names[*]}"))$"
cd "$root"
if [[ "${1:-}" == "--print-skip" ]]; then
  printf '%s\n' "$skip"
  exit 0
fi
go test -skip "$skip" "$@"
