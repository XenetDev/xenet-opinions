#!/bin/sh
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
caddyfile="$root/infra/mirofish/Caddyfile"
suffix=$$
net="xo-caddy-test-$suffix"
upstream="xo-caddy-upstream-$suffix"
proxy="xo-caddy-proxy-$suffix"
open_proxy="xo-caddy-open-$suffix"
token="test-token-$suffix"
failed=0

cleanup() {
  docker rm -f "$proxy" "$open_proxy" "$upstream" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

check() {
  if [ "$2" = "$3" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1: expected [$2] got [$3]"
    failed=1
  fi
}

if ! out=$(docker run --rm -v "$caddyfile:/etc/caddy/Caddyfile:ro" \
  -e MIROFISH_TOKEN=t -e MIROFISH_UPSTREAM=localhost:5001 \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile 2>&1); then
  echo "FAIL caddy validate"
  echo "$out"
  exit 1
fi
echo "ok   caddy validate"

docker network create "$net" >/dev/null
docker run -d --name "$upstream" --network "$net" python:3.11-slim python -c '
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def reply(self):
        body = self.path.encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
    do_GET = do_POST = do_HEAD = reply
ThreadingHTTPServer(("", 5001), H).serve_forever()
' >/dev/null
docker run -d --name "$proxy" --network "$net" -p 127.0.0.1::8080 \
  -v "$caddyfile:/etc/caddy/Caddyfile:ro" \
  -e MIROFISH_TOKEN="$token" -e MIROFISH_UPSTREAM="$upstream:5001" \
  caddy:2 >/dev/null

docker run -d --name "$open_proxy" --network "$net" -p 127.0.0.1::8080 \
  -v "$caddyfile:/etc/caddy/Caddyfile:ro" \
  -e MIROFISH_TOKEN= -e MIROFISH_UPSTREAM="$upstream:5001" \
  caddy:2 >/dev/null

wait_ready() {
  i=0
  until curl -fsS -o /dev/null "$2/health" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "FAIL $1 did not become ready"
      docker logs "$1" 2>&1 | tail -n 20
      exit 1
    fi
    sleep 1
  done
}

base="http://127.0.0.1:$(docker port "$proxy" 8080/tcp | head -n 1 | sed 's/.*://')"
open_base="http://127.0.0.1:$(docker port "$open_proxy" 8080/tcp | head -n 1 | sed 's/.*://')"
wait_ready "$proxy" "$base"
wait_ready "$open_proxy" "$open_base"

check_health_only() {
  name=$1
  shift
  result=$(curl -s -w ' %{http_code}' "$@")
  case $result in
    "/health 200"|*" 401") echo "ok   $name" ;;
    *) echo "FAIL $name: expected upstream path /health or 401, got [$result]"; failed=1 ;;
  esac
}

check "/health without token is proxied" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$base/health")"
check "/health upstream path" "/health" "$(curl -s "$base/health")"
check "HEAD /health without token is proxied" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -I "$base/health")"
check "POST /health without token status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/health")"
check_health_only "/health?x=1" "$base/health?x=1"
check_health_only "//health" --path-as-is "$base//health"
check_health_only "/api/x/../../health" --path-as-is "$base/api/x/../../health"
check_health_only "/api/graph/..%2F..%2Fhealth" --path-as-is "$base/api/graph/..%2F..%2Fhealth"
check_health_only "/health/../api/x" --path-as-is "$base/health/../api/x"
check "/api/x without token status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/x")"
check "/api/x without token body" '{"success":false,"error":"unauthorized"}' \
  "$(curl -s "$base/api/x")"
check "/api/x without token content type" "application/json" \
  "$(curl -s -o /dev/null -w '%{content_type}' "$base/api/x")"
check "/api/x with wrong token status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-MiroFish-Token: wrong' "$base/api/x")"
check "/api/x with token prefix status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "X-MiroFish-Token: ${token}x" "$base/api/x")"
check "/api/x with empty token status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-MiroFish-Token;' "$base/api/x")"
check "/api/x with wildcard token status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-MiroFish-Token: *' "$base/api/x")"
check "/api/x with token is proxied" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "X-MiroFish-Token: $token" "$base/api/x")"
check "/api/x with token body comes from upstream" "/api/x" \
  "$(curl -s -H "X-MiroFish-Token: $token" "$base/api/x")"
check "empty MIROFISH_TOKEN: /health is proxied" "200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$open_base/health")"
check "empty MIROFISH_TOKEN: no header status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$open_base/api/x")"
check "empty MIROFISH_TOKEN: empty header status" "401" \
  "$(curl -s -o /dev/null -w '%{http_code}' -H 'X-MiroFish-Token;' "$open_base/api/x")"

exit "$failed"
