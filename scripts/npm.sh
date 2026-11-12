#!/usr/bin/env bash
# npm in the pinned Node image (the build toolchain only: the UI's runtime is
# nginx with static files, no Node). The repository is mounted at /src; npm's
# cache stays in .npm-cache (ignored).
#
# usage: scripts/npm.sh <npm arguments>      e.g. scripts/npm.sh ci; scripts/npm.sh test
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE_IMAGE=$(sed -n 's/^FROM \(docker\.io\/library\/node:[^ ]*\) AS build$/\1/p' "$ROOT/Dockerfile")
[ -n "$NODE_IMAGE" ] || {
  echo "npm.sh: no Node image in the Dockerfile" >&2
  exit 1
}
tty=()
[ -t 0 ] && tty=(-it)
exec docker run --rm "${tty[@]}" --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/src/.npm-cache \
  -v "$ROOT:/src" -w /src "$NODE_IMAGE" npm "$@"
