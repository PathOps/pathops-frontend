#!/bin/sh
# The PathOps UI's listener, written before nginx starts (the image runs
# /docker-entrypoint.d/*.sh after rendering the templates): with a certificate
# and key at /etc/pathops-frontend/tls the server speaks HTTPS only (TLS 1.2+,
# port 8443), and there is no plaintext listener; without them plain HTTP on
# 8080 (a workstation). A certificate without its key is an error.
set -eu
dir=/etc/pathops-frontend/tls
out=/etc/nginx/conf.d/listen.inc
if [ -e "$dir/tls.crt" ] || [ -e "$dir/tls.key" ]; then
  if [ ! -r "$dir/tls.crt" ] || [ ! -r "$dir/tls.key" ]; then
    echo "listen.sh: $dir needs a readable tls.crt and tls.key" >&2
    exit 1
  fi
  cat >"$out" <<CONF
listen 8443 ssl;
ssl_certificate $dir/tls.crt;
ssl_certificate_key $dir/tls.key;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_session_tickets off;
CONF
  echo "listen.sh: HTTPS on 8443 ($dir)"
else
  echo "listen 8080;" >"$out"
  echo "listen.sh: plain HTTP on 8080 (no certificate in $dir)"
fi
