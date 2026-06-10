# Amazon Linux 2023 (EC2) 部署 count168

你的实例：**Amazon Linux 2023 ARM64**（t4g.medium），公网 IP 示例：`56.68.48.190`。

我无法直接 SSH 进你的 EC2，请用 **EC2 控制台 → 连接 → EC2 Instance Connect** 粘贴命令。

## 一、AWS 安全组（先做）

入站规则至少要有：

| 端口 | 来源 | 用途 |
|------|------|------|
| 22 | 你的 IP | SSH |
| 80 | 0.0.0.0/0 | HTTP |
| 443 | 0.0.0.0/0 | HTTPS |

## 二、DNS

域名 `count168.org` A 记录 → EC2 **公网 IPv4**（不是私有 172.31.x.x）。

## 三、一键装环境 + Nginx（推荐）

SSH / Instance Connect 登录后：

```bash
sudo dnf install -y git
sudo git clone --branch main --depth 1 https://github.com/kunzzgroups/count168test.git /var/www/count168.org
cd /var/www/count168.org
sudo bash deploy/ec2-amazon-linux-setup.sh
```

脚本会：装 nginx / php-fpm / mariadb、去掉默认 Welcome 页、启用 `deploy/nginx/count168.org.amazon-linux.conf`。

## 四、前端 dist

**方式 A — 本机构建后上传（推荐）**

本地：

```bash
cd frontend
npm run build
```

用 WinSCP / FileZilla 把 `frontend/dist/` 整个目录上传到服务器 `/var/www/count168.org/frontend/dist/`。

**方式 B — 在 EC2 上 build**

```bash
sudo dnf install -y nodejs npm
cd /var/www/count168.org/frontend
npm ci
npm run build
```

## 五、数据库

1. 编辑 `/var/www/count168.org/includes/config.php`（Hostinger 的库名/密码要改成 EC2 本地 MySQL）。
2. 导入数据：见 `database/HOSTINGER_IMPORT.md`。

## 六、验证

```bash
curl -I http://127.0.0.1/login
ls /var/www/count168.org/frontend/dist/index.html
sudo systemctl status nginx php-fpm
```

浏览器：`http://count168.org/login` — 应看到登录页，**不是** Welcome to nginx。

## 七、HTTPS

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d count168.org -d www.count168.org
```

## 常见问题

**仍显示 Welcome to nginx**

```bash
sudo rm -f /etc/nginx/conf.d/default.conf
sudo cp /var/www/count168.org/deploy/nginx/count168.org.amazon-linux.conf /etc/nginx/conf.d/count168.org.conf
sudo nginx -t && sudo systemctl reload nginx
```

**502 Bad Gateway**

```bash
ls /run/php-fpm/www.sock
sudo systemctl restart php-fpm nginx
```

**403 / 权限**

```bash
sudo chcon -R -t httpd_sys_content_t /var/www/count168.org
```

**API 数据库连接失败**

检查 `includes/config.php` 与 MariaDB 是否已建库、导入。

**登录弹窗 “An error occurred during login” / 接口 HTTP 500**

不是密码错，是 **PHP 连不上 MySQL**。SSH 到 EC2：

```bash
sudo systemctl status mariadb
mysql -u org_admin -p -h 127.0.0.1 u857194726_c168_org -e "SELECT 1"
```

推荐在服务器创建 `includes/config.local.php`（已在 .gitignore，不会被 git pull 覆盖）：

```bash
sudo cp /var/www/count168.org/includes/config.local.php.example /var/www/count168.org/includes/config.local.php
sudo nano /var/www/count168.org/includes/config.local.php
```

填入 EC2 本地 MySQL 的 `$dbname` / `$dbuser` / `$dbpass`，保存后测试：

```bash
curl -sS -X POST https://count168.org/api/session/login_api.php \
  -F action=login -F company_id=TEST -F login_id=TEST -F password=x -F login_role=admin
```

应返回 JSON（如 `Database connection failed` 或 `Username or password is incorrect`），而不是空白的 HTTP 500。

## 日常更新（推荐：只 push，EC2 自动部署）

**本地一次配置 GitHub Secrets 后**，日常只需：

```bash
# 若改了 frontend 源码，先 build 并一起 commit dist/
cd frontend && npm run build && cd ..
git add -A
git commit -m "你的说明"
git push origin main
```

push 后 GitHub Actions 会自动 SSH 到 EC2 执行 `deploy/deploy.sh`（`git pull` + reload nginx），**不必再手动 SSH**。

### 一次性配置（GitHub → Settings → Secrets and variables → Actions）

| Secret | 值 |
|--------|-----|
| `EC2_HOST` | `56.68.48.190`（或你的 EC2 公网 IP） |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | 登录 EC2 用的 **私钥** 全文（`.pem` 文件内容） |

EC2 上需已 `git clone` 到 `/var/www/count168.org`，且能 `git pull`（公开仓库即可；私有仓库要在 EC2 配 deploy key 或 PAT）。

手动部署（备用）：

```bash
cd /var/www/count168.org
bash deploy/deploy.sh
```

## 日常更新（手动 pull，无 Actions 时）

```bash
cd /var/www/count168.org
git pull origin main
# 若前端有改：本地 build 后只覆盖 frontend/dist/
sudo systemctl reload nginx
```
