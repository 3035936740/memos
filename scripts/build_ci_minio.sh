#!/usr/bin/env bash
# Rebuild the existing S3 test service from its verified upstream source commit;
# the retired public container tags must not silently disable S3 coverage.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
commit=ca258c04cb1dea33c31fed86250eaa3d1f020ff8
image=memos-plus-ci-minio:local
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git init -q "$work/source"
git -C "$work/source" remote add origin https://github.com/minio/minio.git
git -C "$work/source" fetch -q --depth=1 origin "$commit"
git -C "$work/source" checkout -q --detach FETCH_HEAD
[[ "$(git -C "$work/source" rev-parse HEAD)" == "$commit" ]]
mkdir "$work/image"
(
  cd "$work/source"
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o "$work/image/minio" .
)
cp "$work/source/LICENSE" "$work/image/LICENSE"
docker build --file "$root/scripts/ci-minio.Dockerfile" --tag "$image" "$work/image"
echo "S3 test image built from MinIO commit $commit"
