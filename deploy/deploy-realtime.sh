#!/usr/bin/env bash
# EC2: install/start Transaction Payment SSE hub (tx-realtime).
# Safe to re-run. Does not overwrite a non-empty existing secret.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168}"
RT_DIR="${APP_ROOT}/services/tx-realtime"
ENV_FILE="${RT_DIR}/.env"
CFG_LOCAL="${APP_ROOT}/includes/config.local.php"
UNIT_SRC="${APP_ROOT}/deploy/systemd/tx-realtime.service"
UNIT_DST="/etc/systemd/system/tx-realtime.service"
NGINX_SSL="/etc/nginx/conf.d/count168.site-le-ssl.conf"
NGINX_PLAIN="/etc/nginx/conf.d/count168.site.conf"
SNIPPET="${APP_ROOT}/deploy/nginx/realtime-location.inc"

echo "==> tx-realtime deploy in ${RT_DIR}"

if [[ ! -f "${RT_DIR}/server.mjs" ]]; then
  echo "ERROR: ${RT_DIR}/server.mjs missing — sync code first"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not installed (sudo dnf install -y nodejs)"
  exit 1
fi

cd "$RT_DIR"
echo "==> npm install"
npm install --omit=dev

read_php_secret() {
  if [[ ! -f "$CFG_LOCAL" ]]; then
    printf ''
    return 0
  fi
  php -r 'include $argv[1]; echo isset($tx_realtime_secret) ? (string)$tx_realtime_secret : "";' "$CFG_LOCAL" 2>/dev/null || true
}

SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  SECRET="$(grep -E '^TX_REALTIME_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(read_php_secret)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -hex 24)"
  echo "==> generated new TX_REALTIME_SECRET"
else
  echo "==> reusing existing TX_REALTIME_SECRET"
fi

umask 077
printf '%s\n' \
  'TX_REALTIME_HOST=127.0.0.1' \
  'TX_REALTIME_PORT=3911' \
  "TX_REALTIME_SECRET=${SECRET}" \
  '# Optional multi-instance:' \
  '# REDIS_URL=redis://127.0.0.1:6379' \
  > "$ENV_FILE"
chmod 600 "$ENV_FILE"
chown ec2-user:ec2-user "$ENV_FILE" 2>/dev/null || true

if [[ -f "$CFG_LOCAL" ]]; then
  if ! grep -q 'tx_realtime_secret' "$CFG_LOCAL"; then
    echo "==> append realtime settings to config.local.php"
    {
      echo ''
      echo '// Transaction Payment realtime (auto by deploy/deploy-realtime.sh)'
      echo "\$tx_realtime_secret = '${SECRET}';"
      echo "\$tx_realtime_publish_url = 'http://127.0.0.1:3911/publish';"
    } >> "$CFG_LOCAL"
  else
    CURRENT="$(read_php_secret)"
    if [[ -z "$CURRENT" ]]; then
      echo "==> filling empty tx_realtime_secret"
      # SECRET is openssl hex — safe for sed replacement
      sed -i "s/\$tx_realtime_secret = '';/\$tx_realtime_secret = '${SECRET}';/" "$CFG_LOCAL" || true
      sed -i "s/\$tx_realtime_secret = \"\";/\$tx_realtime_secret = '${SECRET}';/" "$CFG_LOCAL" || true
    else
      echo "==> config.local.php already has non-empty tx_realtime_secret"
    fi
  fi
  # php-fpm runs as apache on Amazon Linux — must be able to read secrets.
  # (640 + group nginx leaves apache unable to load $tx_realtime_secret → ticket enabled:false)
  if id apache >/dev/null 2>&1; then
    chgrp apache "$CFG_LOCAL" 2>/dev/null || sudo chgrp apache "$CFG_LOCAL" || true
  fi
  chmod 640 "$CFG_LOCAL" 2>/dev/null || sudo chmod 640 "$CFG_LOCAL" || true
  echo "==> config.local.php perms: $(ls -l "$CFG_LOCAL" | awk '{print $1,$3,$4}')"
else
  echo "WARN: ${CFG_LOCAL} missing — create it and set tx_realtime_secret"
fi

if [[ -f "$UNIT_SRC" ]]; then
  echo "==> install systemd unit"
  sudo cp "$UNIT_SRC" "$UNIT_DST"
  sudo systemctl daemon-reload
  sudo systemctl enable tx-realtime
  sudo systemctl restart tx-realtime
  sleep 1
  sudo systemctl --no-pager --full status tx-realtime || true
fi

inject_realtime_nginx() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if sudo grep -q 'location ^~ /realtime/' "$f"; then
    echo "==> nginx already has /realtime/ in $f"
    return 0
  fi
  if ! sudo grep -q 'location ^~ /api/' "$f"; then
    echo "WARN: no location ^~ /api/ in $f — skip inject"
    return 0
  fi
  if [[ ! -f "$SNIPPET" ]]; then
    echo "ERROR: missing snippet $SNIPPET"
    return 1
  fi
  echo "==> inject /realtime/ into $f"
  local tmp
  tmp="$(mktemp)"
  sudo awk -v snip="$SNIPPET" '
    BEGIN { done = 0 }
    !done && index($0, "location ^~ /api/") {
      while ((getline line < snip) > 0) print line
      close(snip)
      print ""
      done = 1
    }
    { print }
  ' "$f" > "$tmp"
  sudo cp "$tmp" "$f"
  rm -f "$tmp"
}

inject_realtime_nginx "$NGINX_SSL"
inject_realtime_nginx "$NGINX_PLAIN"

if sudo nginx -t; then
  sudo systemctl reload nginx
  echo "==> nginx reloaded"
else
  echo "ERROR: nginx -t failed after realtime patch"
  exit 1
fi

echo "==> health check"
curl -sS --max-time 3 http://127.0.0.1:3911/health
echo
echo "==> tx-realtime deploy OK"
