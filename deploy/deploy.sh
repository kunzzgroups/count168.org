#!/usr/bin/env bash
# EC2 上执行：拉取 main 并生效（由 GitHub Actions SSH 调用，或手动运行）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168}"
BRANCH="${BRANCH:-main}"

cd "$APP_ROOT"

echo "==> git fetch + reset to origin/${BRANCH}"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

# 同步 Nginx 站点配置（git pull 不会自动更新 /etc/nginx/）
NGINX_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux.conf"
NGINX_DST="/etc/nginx/conf.d/count168.org.conf"
if [[ -f "$NGINX_SRC" ]]; then
  echo "==> sync nginx org config"
  sudo cp "$NGINX_SRC" "$NGINX_DST"
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  sudo nginx -t
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  sudo systemctl reload nginx || true
fi

echo "==> Deploy OK at $(date -Iseconds)"
