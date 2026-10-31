#!/usr/bin/env bash

# Black-box fresh-install and restart test for the current Memos Plus image.
#
# By default, the script builds the current worktree as a local Docker image.
# Pass --candidate-image to test an image that has already been built.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

candidate_image="${MEMOS_SMOKE_CANDIDATE_IMAGE:-}"
keep_resources="${MEMOS_SMOKE_KEEP_RESOURCES:-0}"
smoke_driver="${MEMOS_SMOKE_DRIVER:-sqlite}"

usage() {
  cat <<'EOF'
Usage: ./scripts/release_smoke_test.sh [options]

Runs fresh-install and restart-persistence checks against Memos Plus.
Uses only new databases; upstream Memos database upgrades are unsupported.

Options:
  --candidate-image IMAGE  Test an existing image instead of building locally.
  --keep-resources         Keep containers and volumes after the test for debugging.
  -h, --help               Show this help text.

Environment equivalents:
  MEMOS_SMOKE_CANDIDATE_IMAGE
  MEMOS_SMOKE_DRIVER=sqlite|mysql|postgres
  MEMOS_SMOKE_KEEP_RESOURCES=1

Examples:
  ./scripts/release_smoke_test.sh
  ./scripts/release_smoke_test.sh \
    --candidate-image memos-smoke:local
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --candidate-image)
      (($# >= 2)) || die "--candidate-image requires a value"
      candidate_image="$2"
      shift 2
      ;;
    --keep-resources)
      keep_resources=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
done

for command_name in curl docker git jq cmp; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is required"
done

docker info >/dev/null 2>&1 || die "Docker is not running"

run_id="${GITHUB_RUN_ID:-local}-$(date +%s)-$$"
fresh_container="memos-smoke-fresh-$run_id"
fresh_volume="memos-smoke-fresh-$run_id"
temp_dir="$(mktemp -d)"
smoke_network="memos-smoke-net-$run_id"
db_container="memos-smoke-db-$run_id"
db_password="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
smoke_dsn=""

frontend_index="$REPO_ROOT/server/router/frontend/dist/index.html"
frontend_index_backup="$temp_dir/frontend-index.html"
frontend_index_existed=0
frontend_index_backed_up=0

restore_frontend_index() {
  if [[ "$frontend_index_backed_up" != "1" ]]; then
    return
  fi

  if [[ "$frontend_index_existed" == "1" ]]; then
    cp "$frontend_index_backup" "$frontend_index"
  else
    rm -f "$frontend_index"
  fi
  frontend_index_backed_up=0
}

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

cleanup() {
  local status=$?
  trap - EXIT

  restore_frontend_index

  if ((status != 0)); then
    for container_name in "$fresh_container" "$db_container"; do
      if container_exists "$container_name"; then
        printf '\n--- docker logs: %s ---\n' "$container_name" >&2
        docker logs "$container_name" >&2 || true
      fi
    done
  fi

  if [[ "$keep_resources" == "1" ]]; then
    printf '\nKept smoke-test resources for debugging:\n'
    printf '  container: %s\n' "$fresh_container"
    printf '  volume: %s\n' "$fresh_volume"
  else
    docker rm -f "$fresh_container" >/dev/null 2>&1 || true
    docker volume rm "$fresh_volume" >/dev/null 2>&1 || true
    docker rm -f "$db_container" >/dev/null 2>&1 || true
    docker network rm "$smoke_network" >/dev/null 2>&1 || true
  fi

  rm -rf "$temp_dir"
  exit "$status"
}
trap cleanup EXIT

build_local_candidate() {
  local commit_sha image_tag
  command -v pnpm >/dev/null 2>&1 || die "pnpm is required to build the local candidate"

  commit_sha="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
  image_tag="memos-smoke:${commit_sha}-${run_id}"

  mkdir -p "$(dirname "$frontend_index")"
  if [[ -f "$frontend_index" ]]; then
    cp "$frontend_index" "$frontend_index_backup"
    frontend_index_existed=1
  fi
  frontend_index_backed_up=1

  log "Building frontend release assets"
  (
    cd "$REPO_ROOT/web"
    pnpm release
  )

  log "Building candidate image $image_tag"
  docker build \
    --file "$REPO_ROOT/scripts/Dockerfile" \
    --build-arg VERSION=smoke-local \
    --build-arg COMMIT="$commit_sha" \
    --tag "$image_tag" \
    "$REPO_ROOT"

  restore_frontend_index
  candidate_image="$image_tag"
}

ensure_image() {
  local image="$1"
  if docker image inspect "$image" >/dev/null 2>&1; then
    return
  fi
  log "Pulling image $image"
  docker pull "$image"
}

wait_until_ready() {
  local container_name="$1"
  local base_url="$2"
  local attempt

  for attempt in $(seq 1 90); do
    if curl --fail --silent --show-error --max-time 2 "$base_url/healthz" >/dev/null 2>&1; then
      return
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || true)" != "true" ]]; then
      break
    fi
    sleep 2
  done

  docker logs "$container_name" >&2 || true
  die "$container_name did not become ready"
}

current_base_url=""

set_current_base_url() {
  local container_name="$1"
  local port_mapping port

  port_mapping="$(docker port "$container_name" 5230/tcp)"
  port="${port_mapping##*:}"
  [[ -n "$port" ]] || die "could not determine the host port for $container_name"
  current_base_url="http://127.0.0.1:$port"
}

start_container() {
  local container_name="$1"
  local image="$2"
  local volume="$3"

  local database_options=()
  if [[ "$smoke_driver" != "sqlite" ]]; then
    local database_name="fresh"
    database_options=(--network "$smoke_network" --env "MEMOS_DRIVER=$smoke_driver" --env "MEMOS_DSN=${smoke_dsn//DATABASE/$database_name}")
  fi
  docker run --detach "${database_options[@]}" \
    --name "$container_name" \
    --label "org.usememos.release-smoke=$run_id" \
    --publish "127.0.0.1::5230" \
    --env MEMOS_MODE=prod \
    --env MEMOS_INSTANCE_URL=http://localhost \
    --mount "type=volume,source=$volume,target=/var/opt/memos" \
    "$image" >/dev/null

  set_current_base_url "$container_name"
  wait_until_ready "$container_name" "$current_base_url"
}

assert_frontend_assets() {
  local html asset_path asset_url
  html="$(curl --fail --silent --show-error "$current_base_url/")"
  grep -q 'id="root"' <<<"$html" || die "frontend root element was not served"

  asset_path="$(grep -o 'src="[^"]*\.js"' <<<"$html" | sed -n '1{s/^src="//;s/"$//;p;}' || true)"
  [[ -n "$asset_path" ]] || die "frontend JavaScript asset was not found"
  case "$asset_path" in
    http://*|https://*) asset_url="$asset_path" ;;
    /*) asset_url="$current_base_url$asset_path" ;;
    *) asset_url="$current_base_url/$asset_path" ;;
  esac
  curl --fail --silent --show-error "$asset_url" >/dev/null
}

create_admin() {
  local payload response
  payload="$(jq -nc '{username:"smoke-admin",password:"smoke-password",email:"smoke@example.test"}')"
  response="$(curl --fail --silent --show-error \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$current_base_url/api/v1/users")"
  jq -e '.username == "smoke-admin" and .role == "ADMIN"' <<<"$response" >/dev/null
}

sign_in() {
  local payload
  payload="$(jq -nc '{passwordCredentials:{username:"smoke-admin",password:"smoke-password"}}')"
  curl --fail --silent --show-error \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$current_base_url/api/v1/auth/signin" | jq -er '.accessToken'
}

create_memo() {
  local token="$1"
  local memo_id="$2"
  local content="$3"
  local payload response
  payload="$(jq -nc --arg content "$content" '{content:$content,visibility:"PRIVATE"}')"
  response="$(curl --fail --silent --show-error \
    --header "Authorization: Bearer $token" \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$current_base_url/api/v1/memos?memoId=$memo_id")"
  jq -e --arg name "memos/$memo_id" --arg content "$content" '.name == $name and .content == $content' <<<"$response" >/dev/null
}

assert_memo() {
  local token="$1"
  local memo_id="$2"
  local content="$3"
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $token" \
    "$current_base_url/api/v1/memos/$memo_id" |
    jq -e --arg content "$content" '.content == $content' >/dev/null
}

if [[ -z "$candidate_image" ]]; then
  build_local_candidate
else
  ensure_image "$candidate_image"
fi

log "Candidate image: $candidate_image"

if [[ "$smoke_driver" != "sqlite" ]]; then
  docker network create "$smoke_network" >/dev/null
  case "$smoke_driver" in
    mysql)
      docker run -d --name "$db_container" --network "$smoke_network" --network-alias sql \
        -e "MYSQL_ROOT_PASSWORD=$db_password" -e MYSQL_ROOT_HOST=% mysql:8.4 >/dev/null
      for attempt in $(seq 1 90); do
        docker exec "$db_container" mysql -h127.0.0.1 -uroot -p"$db_password" -e 'SELECT 1' >/dev/null 2>&1 && break
        sleep 2
      done
      docker exec "$db_container" mysql -uroot -p"$db_password" -e 'CREATE DATABASE fresh;'
      smoke_dsn="root:$db_password@tcp(sql:3306)/DATABASE"
      ;;
    postgres)
      docker run -d --name "$db_container" --network "$smoke_network" --network-alias sql \
        -e "POSTGRES_PASSWORD=$db_password" postgres:18 >/dev/null
      for attempt in $(seq 1 90); do
        docker exec "$db_container" pg_isready -h127.0.0.1 -U postgres >/dev/null 2>&1 && break
        sleep 2
      done
      docker exec "$db_container" createdb -U postgres fresh
      smoke_dsn="postgresql://postgres:$db_password@sql:5432/DATABASE?sslmode=disable"
      ;;
    *) die "unsupported MEMOS_SMOKE_DRIVER: $smoke_driver" ;;
  esac
fi
log "Checking complete license in the actual candidate image"
docker run --rm --entrypoint cat "$candidate_image" /usr/local/memos/LICENSE > "$temp_dir/image-LICENSE"
cmp "$REPO_ROOT/LICENSE" "$temp_dir/image-LICENSE" || die "candidate LICENSE differs from the source"
docker run --rm --entrypoint cat "$candidate_image" /usr/local/memos/visual-effects-NOTICES.txt > "$temp_dir/image-NOTICES"
cmp "$REPO_ROOT/web/public/visual-effects-NOTICES.txt" "$temp_dir/image-NOTICES" || die "candidate third-party notices differ from the source"

log "Running fresh-install smoke test ($smoke_driver)"
docker volume create "$fresh_volume" >/dev/null
start_container "$fresh_container" "$candidate_image" "$fresh_volume"
assert_frontend_assets
create_admin
fresh_token="$(sign_in)"
create_memo "$fresh_token" "release-smoke" "fresh install smoke sentinel"

docker restart "$fresh_container" >/dev/null
set_current_base_url "$fresh_container"
wait_until_ready "$fresh_container" "$current_base_url"
fresh_token="$(sign_in)"
assert_memo "$fresh_token" "release-smoke" "fresh install smoke sentinel"
docker rm -f "$fresh_container" >/dev/null

log "Memos Plus fresh-install and restart checks passed ($smoke_driver)"
