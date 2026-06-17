#!/usr/bin/env bash
# EC2 上执行：拉取 main 并生效（由 GitHub Actions SSH 调用，或手动运行）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168}"
BRANCH="${BRANCH:-main}"

cd "$APP_ROOT"

# 首次 clone 若用了 sudo，.git 会归 root，ec2-user / Actions 无法 fetch
if [[ -d "$APP_ROOT/.git" ]] && [[ ! -w "$APP_ROOT/.git/objects" ]]; then
  echo "==> fixing repo ownership for $(whoami)"
  if command -v sudo >/dev/null 2>&1; then
    sudo chown -R "$(whoami):nginx" "$APP_ROOT" 2>/dev/null \
      || sudo chown -R "$(whoami):$(id -gn)" "$APP_ROOT"
  else
    echo "ERROR: $APP_ROOT/.git is not writable. Run: sudo chown -R ec2-user:nginx $APP_ROOT"
    exit 1
  fi
fi

echo "==> git fetch + reset to origin/${BRANCH}"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

# 同步 Nginx 站点配置（git pull 不会自动更新 /etc/nginx/）
NGINX_SRC="$APP_ROOT/deploy/nginx/count168.site.amazon-linux.conf"
NGINX_DST="/etc/nginx/conf.d/count168.site.conf"
if [[ -f "$NGINX_SRC" ]]; then
  echo "==> sync nginx site config"
  sudo cp "$NGINX_SRC" "$NGINX_DST"
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  sudo nginx -t
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  sudo systemctl reload nginx || true
fi

echo "==> Deploy OK at $(date -Iseconds)"
