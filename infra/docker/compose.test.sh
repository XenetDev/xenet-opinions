#!/usr/bin/env bash
set -uo pipefail

command -v jq >/dev/null || { echo "compose.test.sh needs jq"; exit 2; }
unset LLM_API_KEY ZEP_API_KEY LLM_BASE_URL LLM_MODEL_NAME MIROFISH_UPSTREAM COMPOSE_PROFILES COMPOSE_FILE COMPOSE_PROJECT_NAME XO_WEB_PORT XO_IMAGE_TAG

root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d /tmp/xo-compose-test.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
env_file="$tmp/env"
failed=0

check() {
  if [ "$2" = "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1: expected [$2] got [$3]"
    failed=1
  fi
}

sed \
  -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" \
  -e "s|^MIROFISH_TOKEN=.*|MIROFISH_TOKEN=$(openssl rand -hex 32)|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" \
  -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^LLM_API_KEY=.*|LLM_API_KEY=|" \
  -e "s|^ZEP_API_KEY=.*|ZEP_API_KEY=|" \
  "$root/.env.selfhost.example" >"$env_file"

run() {
  XO_ENV_FILE="$env_file" bash "$root/infra/docker/$1" "${@:2}"
}

run up-mock.sh config >"$tmp/mock.yml" 2>"$tmp/mock.err"
check "mock config without keys exits 0" 0 $?

run up.sh config >/dev/null 2>"$tmp/real.err"
check "real config without keys exits 1" 1 $?
check "real config names a missing key" 1 "$(grep -cE 'set (LLM|ZEP)_API_KEY in .env.selfhost' "$tmp/real.err")"

sed -i.bak -e 's|^ZEP_API_KEY=.*|ZEP_API_KEY=dummy-zep|' "$env_file"
run up.sh config >/dev/null 2>"$tmp/real.err"
check "real config without LLM key exits 1" 1 $?
check "real config names LLM_API_KEY" 1 "$(grep -c 'set LLM_API_KEY in .env.selfhost' "$tmp/real.err")"

sed -i.bak -e 's|^LLM_API_KEY=.*|LLM_API_KEY=dummy-llm|' -e 's|^ZEP_API_KEY=.*|ZEP_API_KEY=|' "$env_file"
run up.sh config >/dev/null 2>"$tmp/real.err"
check "real config without ZEP key exits 1" 1 $?
check "real config names ZEP_API_KEY" 1 "$(grep -c 'set ZEP_API_KEY in .env.selfhost' "$tmp/real.err")"

sed -i.bak -e 's|^LLM_API_KEY=.*|LLM_API_KEY=dummy-llm|' -e 's|^ZEP_API_KEY=.*|ZEP_API_KEY=dummy-zep|' "$env_file"

run up.sh config >"$tmp/real.yml" 2>"$tmp/real.err"
check "real config with keys exits 0" 0 $?

for mode in real mock; do
  yml="$tmp/$mode.yml"
  check "$mode publishes one port" 1 "$(grep -c 'published' "$yml")"
  check "$mode has no profiles" 0 "$(grep -c 'profiles' "$yml")"
  check "$mode has pull_policy: missing at least 3 times" yes "$([ "$(grep -c 'pull_policy: missing' "$yml")" -ge 3 ] && echo yes || echo no)"
done

check "real proxy upstream" "mirofish:5001" \
  "$(run up.sh config --format json 2>/dev/null | jq -r '.services["mirofish-proxy"].environment.MIROFISH_UPSTREAM')"
check "mock proxy upstream" "mirofish-mock:5001" \
  "$(run up-mock.sh config --format json 2>/dev/null | jq -r '.services["mirofish-proxy"].environment.MIROFISH_UPSTREAM')"
sed -i.bak -e '/^LLM_BASE_URL=/d' -e '/^LLM_MODEL_NAME=/d' "$env_file"
check "real mirofish LLM defaults" '["https://api.openai.com/v1","gpt-4o-mini"]' \
  "$(run up.sh config --format json 2>/dev/null | jq -c '.services.mirofish.environment | [.LLM_BASE_URL, .LLM_MODEL_NAME]')"
check "real mirofish has no ports" false \
  "$(run up.sh config --format json 2>/dev/null | jq -c '.services.mirofish | has("ports")')"
check "mock has no mirofish service" null \
  "$(run up-mock.sh config --format json 2>/dev/null | jq -c '.services.mirofish')"

check "example leaves the web app urls unset" 0 "$(grep -cE '^(NEXT_PUBLIC_APP_URL|BETTER_AUTH_URL)=' "$env_file")"
sed -i.bak -e 's|^XO_WEB_PORT=.*|XO_WEB_PORT=8080|' "$env_file"
web_cfg=$(run up-mock.sh config --format json 2>/dev/null)
check "web app urls default to the web port" '["http://localhost:8080","http://localhost:8080"]' \
  "$(jq -c '.services.web.environment | [.NEXT_PUBLIC_APP_URL, .BETTER_AUTH_URL]' <<<"$web_cfg")"
check "web build arg defaults to the web port" http://localhost:8080 "$(jq -r '.services.web.build.args.NEXT_PUBLIC_APP_URL' <<<"$web_cfg")"

sed -i.bak -e 's|^XO_WEB_PORT=.*|XO_WEB_PORT=|' -e '$a\
NEXT_PUBLIC_APP_URL=\
BETTER_AUTH_URL=' "$env_file"
web_env=$(run up-mock.sh config --format json 2>/dev/null | jq -c '.services.web.environment | [.NEXT_PUBLIC_APP_URL, .BETTER_AUTH_URL]')
check "blank web app urls default to localhost:3000" '["http://localhost:3000","http://localhost:3000"]' "$web_env"

if [ "$failed" -ne 0 ]; then
  echo FAIL
  exit 1
fi
echo PASS
