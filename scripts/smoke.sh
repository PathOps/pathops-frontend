#!/usr/bin/env bash
# Serves an image of the UI as a Cell runs it (non-root, read-only root
# filesystem, tmpfs for nginx's runtime files) and checks it: the SPA answers
# every route with index.html, the CSP allows only this origin and the Cell's
# Dex, assets are immutable and a missing asset is 404. Then with a
# throwaway certificate: HTTPS only (TLS 1.2+), verified for its Service name.
#
# usage: scripts/smoke.sh <image>
set -euo pipefail

IMAGE=${1:?usage: scripts/smoke.sh <image>}
NAME=pathops-frontend-smoke-$$
PORT=${SMOKE_PORT:-18081}
H=$(mktemp)
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$H"' EXIT
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" -e PATHOPS_DEX_ORIGIN=https://dex-smoke.example \
  -e PATHOPS_EVENTS_ORIGIN=https://events-smoke.example \
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
grep -qi "^content-security-policy: default-src 'self'; connect-src 'self' https://dex-smoke.example https://events-smoke.example wss://events-smoke.example;" "$H" \
  || fail "no CSP for the Dex and pathops-events origins"
grep -qi "^x-frame-options: DENY" "$H" || fail "no X-Frame-Options"
grep -qi "^cache-control: no-cache" "$H" || fail "index.html is cached"
asset=$(grep -o '/assets/[^"]*\.js' <<<"$page" | head -n 1)
[ -n "$asset" ] || fail "no script asset"
curl -sS -D "$H" -o /dev/null "$base$asset"
grep -qi "^cache-control: public, max-age=31536000, immutable" "$H" || fail "assets are not immutable"
[ "$(curl -sS -o /dev/null -w '%{http_code}' "$base/assets/missing.js")" = 404 ] || fail "a missing asset is not 404"
echo "smoke: OK ($IMAGE)"

# TLS (a Cell): with a certificate mounted the image serves HTTPS only on
# 8443, verified for its Service name; plaintext to that port is refused, a
# client with another CA or another name is refused, and nothing listens on
# 8080.
TLS_NAME=pathops-frontend-smoke-tls-$$
D=$(mktemp -d)
trap 'docker rm -f "$NAME" "$TLS_NAME" >/dev/null 2>&1 || true; rm -rf "$H" "$D"' EXIT
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 -subj "/CN=smoke CA" \
  -addext "basicConstraints=critical,CA:TRUE" -keyout "$D/ca.key" -out "$D/ca.crt" 2>/dev/null
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 -subj "/CN=other CA" -keyout "$D/other.key" -out "$D/other.crt" 2>/dev/null
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj "/CN=pathops-frontend.pathops-system.svc" \
  -keyout "$D/tls.key" -out "$D/tls.csr" 2>/dev/null
openssl x509 -req -in "$D/tls.csr" -CA "$D/ca.crt" -CAkey "$D/ca.key" -CAcreateserial -days 1 -out "$D/tls.crt" \
  -extfile <(printf 'subjectAltName=DNS:pathops-frontend.pathops-system.svc\nextendedKeyUsage=serverAuth\n') 2>/dev/null
chmod 0644 "$D/tls.crt" "$D/tls.key"
TPORT=${SMOKE_TLS_PORT:-18443}
docker run -d --name "$TLS_NAME" -p "127.0.0.1:$TPORT:8443" -p "127.0.0.1:$((TPORT + 1)):8080" \
  -e PATHOPS_DEX_ORIGIN=https://dex-smoke.example -e PATHOPS_EVENTS_ORIGIN=https://events-smoke.example \
  -v "$D/tls.crt:/etc/pathops-frontend/tls/tls.crt:ro" -v "$D/tls.key:/etc/pathops-frontend/tls/tls.key:ro" \
  --read-only --tmpfs /tmp --tmpfs /etc/nginx/conf.d:uid=101 --user 101 --cap-drop ALL "$IMAGE" >/dev/null
tls() { curl -sS --max-time 5 --resolve "pathops-frontend.pathops-system.svc:$TPORT:127.0.0.1" "$@"; }
for _ in $(seq 30); do
  if tls -f --cacert "$D/ca.crt" "https://pathops-frontend.pathops-system.svc:$TPORT/" >/dev/null 2>&1; then break; fi
  sleep 1
done
tls -f --cacert "$D/ca.crt" -D "$H" "https://pathops-frontend.pathops-system.svc:$TPORT/applications" | grep -q "<title>PathOps</title>" \
  || { docker logs "$TLS_NAME" >&2; fail "HTTPS with the Cell CA and the Service name does not serve the SPA"; }
grep -qi "^content-security-policy: default-src 'self';" "$H" || fail "no CSP over HTTPS"
! tls --cacert "$D/other.crt" "https://pathops-frontend.pathops-system.svc:$TPORT/" >/dev/null 2>&1 || fail "another CA was accepted"
! curl -sS --max-time 5 --cacert "$D/ca.crt" --resolve "other.example:$TPORT:127.0.0.1" "https://other.example:$TPORT/" >/dev/null 2>&1 \
  || fail "another host name was accepted"
! tls -f --cacert "$D/ca.crt" --tls-max 1.1 "https://pathops-frontend.pathops-system.svc:$TPORT/" >/dev/null 2>&1 || fail "TLS 1.1 was accepted"
code=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$TPORT/" 2>/dev/null || true)
[ "$code" = 400 ] || fail "plaintext HTTP to the TLS port got $code, not 400"
! curl -sS --max-time 5 "http://127.0.0.1:$((TPORT + 1))/" >/dev/null 2>&1 || fail "a plaintext listener on 8080 answers next to TLS"
echo "smoke: TLS OK ($IMAGE)"
