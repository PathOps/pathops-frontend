#!/usr/bin/env bash
# Serves an image of the UI as a Cell runs it (non-root, read-only root
# filesystem, tmpfs for nginx's runtime files) and checks it: the SPA answers
# every route with index.html, the CSP allows only this origin and the Cell's
# Dex, assets are immutable and a missing asset is 404.
#
# usage: scripts/smoke.sh <image>
set -euo pipefail

IMAGE=${1:?usage: scripts/smoke.sh <image>}
NAME=pathops-frontend-smoke-$$
PORT=${SMOKE_PORT:-18081}
H=$(mktemp)
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$H"' EXIT
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" -e PATHOPS_DEX_ORIGIN=https://dex-smoke.example \
  --read-only --tmpfs /tmp --tmpfs /etc/nginx/conf.d:uid=101 --user 101 --cap-drop ALL "$IMAGE" >/dev/null
for _ in $(seq 30); do
  if curl -sf "http://127.0.0.1:$PORT/" >/dev/null; then break; fi
  sleep 1
done
fail() {
  echo "smoke: $*" >&2
  docker logs "$NAME" >&2 || true
  exit 1
}
base=http://127.0.0.1:$PORT
page=$(curl -sS -D "$H" "$base/applications/x/deliveries/y")
grep -q "<title>PathOps</title>" <<<"$page" || fail "a client route is not the SPA"
grep -qi "^content-security-policy: default-src 'self'; connect-src 'self' https://dex-smoke.example;" "$H" || fail "no CSP for the Dex origin"
grep -qi "^x-frame-options: DENY" "$H" || fail "no X-Frame-Options"
grep -qi "^cache-control: no-cache" "$H" || fail "index.html is cached"
asset=$(grep -o '/assets/[^"]*\.js' <<<"$page" | head -n 1)
[ -n "$asset" ] || fail "no script asset"
curl -sS -D "$H" -o /dev/null "$base$asset"
grep -qi "^cache-control: public, max-age=31536000, immutable" "$H" || fail "assets are not immutable"
[ "$(curl -sS -o /dev/null -w '%{http_code}' "$base/assets/missing.js")" = 404 ] || fail "a missing asset is not 404"
echo "smoke: OK ($IMAGE)"
