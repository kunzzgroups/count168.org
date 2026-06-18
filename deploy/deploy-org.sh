#!/usr/bin/env bash
# EC2 上执行：拉取 main 到 /var/www/count168.org（GitHub Actions deploy-org job / 手动）
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/count168.org}"
BRANCH="${BRANCH:-main}"

echo "==> deploy-org start: user=$(whoami) host=$(hostname) root=${APP_ROOT}"
df -h "$APP_ROOT" / 2>/dev/null | tail -n +2 || true

if [[ ! -d "$APP_ROOT/.git" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "${SCRIPT_DIR}/bootstrap-org-repo.sh"
fi

cd "$APP_ROOT"

fix_repo_permissions() {
  echo "==> fixing repo ownership for $(whoami)"
  if ! command -v sudo >/dev/null 2>&1; then
    echo "ERROR: ${APP_ROOT}/.git is not writable and sudo is unavailable"
    exit 1
  fi
  if ! sudo chown -R "$(whoami):nginx" "$APP_ROOT"; then
    sudo chown -R "$(whoami):$(id -gn)" "$APP_ROOT"
  fi
}

if [[ ! -w "$APP_ROOT/.git/objects" ]] || [[ ! -w "$APP_ROOT/.git/FETCH_HEAD" ]]; then
  fix_repo_permissions
fi

echo "==> git fetch + reset to origin/${BRANCH}"
if ! git fetch origin "$BRANCH"; then
  echo "==> git fetch failed, retry after chown"
  fix_repo_permissions
  git fetch origin "$BRANCH"
fi
git reset --hard "origin/${BRANCH}"

if command -v chcon >/dev/null 2>&1; then
  chcon -R -t httpd_sys_content_t "$APP_ROOT" 2>/dev/null || true
fi

NGINX_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux.conf"
NGINX_HTTP_REDIRECT_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux-http-redirect.conf"
NGINX_SSL_SRC="$APP_ROOT/deploy/nginx/count168.org.amazon-linux-ssl.conf"
NGINX_DST="/etc/nginx/conf.d/count168.org.conf"
NGINX_SSL_DST="/etc/nginx/conf.d/count168.org-le-ssl.conf"
LE_CERT="/etc/letsencrypt/live/count168.org/fullchain.pem"

install_nginx_file() {
  local src="$1"
  local dst="$2"
  local label="$3"
  if [[ ! -f "$src" ]]; then
    echo "==> skip nginx sync ($label): $src missing"
    return 0
  fi
  echo "==> sync nginx $label"
  local bak
  bak="$(mktemp)"
  sudo cp "$dst" "$bak" 2>/dev/null || true
  sudo cp "$src" "$dst"
  if ! sudo nginx -t; then
    echo "ERROR: nginx -t failed after syncing $label — restoring previous config"
    if [[ -f "$bak" ]]; then
      sudo cp "$bak" "$dst"
      sudo nginx -t || true
    fi
    rm -f "$bak"
    exit 1
  fi
  rm -f "$bak"
}

if [[ -f "$LE_CERT" ]] || [[ -f "$NGINX_SSL_DST" ]]; then
  install_nginx_file "$NGINX_SSL_SRC" "$NGINX_SSL_DST" "org HTTPS"
  install_nginx_file "$NGINX_HTTP_REDIRECT_SRC" "$NGINX_DST" "org HTTP redirect"
else
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  install_nginx_file "$NGINX_SRC" "$NGINX_DST" "org HTTP"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  sudo systemctl reload nginx || true
fi

echo "==> Deploy OK at $(date -Iseconds)"
FRONTEND_INDEX="${APP_ROOT}/frontend/dist/index.html"
if [[ -f "$FRONTEND_INDEX" ]]; then
  grep -o 'index-[A-Za-z0-9_-]*\.js' "$FRONTEND_INDEX" | head -1 || true
fi
