# Windows PHP 环境安装指南

## 当前状态
✅ PHP 8.4.5 已安装
❌ MySQL 未安装
❌ Web 服务器（Apache/Nginx）未安装

## 推荐方案：使用 XAMPP（最简单）

XAMPP 是一个集成的开发环境，包含：
- Apache（Web 服务器）
- MySQL（数据库）
- PHP
- phpMyAdmin（数据库管理工具）

### 安装步骤

#### 1. 下载 XAMPP
访问：https://www.apachefriends.org/download.html
- 选择 Windows 版本
- 下载 PHP 8.x 版本（推荐 PHP 8.2 或 8.3）

#### 2. 安装 XAMPP
1. 运行下载的安装程序
2. 选择安装路径（默认：`C:\xampp`）
3. 选择要安装的组件：
   - ✅ Apache
   - ✅ MySQL
   - ✅ PHP
   - ✅ phpMyAdmin
4. 完成安装

#### 3. 配置 PHP（如果使用已安装的 PHP 8.4.5）

**选项 A：使用 XAMPP 自带的 PHP**
- 直接使用 XAMPP 的 PHP，无需额外配置

**选项 B：使用已安装的 PHP 8.4.5**
1. 找到 PHP 8.4.5 的安装路径（通常在 `C:\php` 或类似位置）
2. 编辑 `C:\xampp\apache\conf\httpd.conf`
3. 找到 `LoadModule php_module` 行，修改为：
   ```apache
   LoadModule php_module "C:/php/php8apache2_4.dll"
   ```
4. 添加 PHP 配置：
   ```apache
   PHPIniDir "C:/php"
   AddHandler application/x-httpd-php .php
   ```

#### 4. 启用必要的 PHP 扩展
编辑 `php.ini` 文件（在 PHP 安装目录或 XAMPP 的 PHP 目录）：
```ini
extension=pdo_mysql
extension=mysqli
extension=mbstring
extension=curl
extension=openssl
```

#### 5. 启动服务
1. 打开 XAMPP Control Panel
2. 启动 Apache
3. 启动 MySQL

#### 6. 测试安装
- 访问：http://localhost
- 访问：http://localhost/phpmyadmin

#### 7. 配置项目
1. 将项目文件夹复制到 `C:\xampp\htdocs\count168`
2. 或者配置虚拟主机（见下方）

---

## 方案二：手动安装（高级用户）

### 1. 安装 MySQL

#### 使用 MySQL Installer
1. 下载：https://dev.mysql.com/downloads/installer/
2. 选择 "MySQL Installer for Windows"
3. 选择 "Developer Default" 或 "Server only"
4. 设置 root 密码
5. 完成安装

#### 或使用 Chocolatey（推荐）
```powershell
# 以管理员身份运行 PowerShell
choco install mysql -y
```

### 2. 安装 Apache

#### 使用 Chocolatey
```powershell
choco install apache-httpd -y
```

#### 或手动安装
1. 下载：https://httpd.apache.org/download.cgi
2. 解压到 `C:\Apache24`
3. 配置 `httpd.conf`

### 3. 配置 PHP 与 Apache
编辑 Apache 的 `httpd.conf`：
```apache
LoadModule php_module "C:/php/php8apache2_4.dll"
PHPIniDir "C:/php"
AddHandler application/x-httpd-php .php
```

### 4. 配置 MySQL
1. 启动 MySQL 服务
2. 创建数据库（根据 `config.php`）：
   ```sql
   CREATE DATABASE u857194726_count168;
   CREATE USER 'u857194726_count168'@'localhost' IDENTIFIED BY 'Kholdings1688@';
   GRANT ALL PRIVILEGES ON u857194726_count168.* TO 'u857194726_count168'@'localhost';
   FLUSH PRIVILEGES;
   ```

---

## 方案三：使用 Laragon（推荐，现代化）

Laragon 是一个现代化的 Windows 开发环境，比 XAMPP 更快更轻量。

### 安装步骤
1. 下载：https://laragon.org/download/
2. 安装 Laragon
3. 启动 Laragon
4. 点击 "Start All" 启动服务
5. 项目会自动在 `C:\laragon\www` 目录下运行

---

## 配置虚拟主机（可选）

### XAMPP 虚拟主机配置
编辑 `C:\xampp\apache\conf\extra\httpd-vhosts.conf`：
```apache
<VirtualHost *:80>
    DocumentRoot "C:/Users/User/OneDrive/Desktop/count168"
    ServerName count168.local
    <Directory "C:/Users/User/OneDrive/Desktop/count168">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

编辑 `C:\Windows\System32\drivers\etc\hosts`（需要管理员权限）：
```
127.0.0.1    count168.local
```

重启 Apache，然后访问：http://count168.local

---

## 验证安装

### 检查 PHP
```powershell
php -v
php -m  # 查看已安装的扩展
```

### 检查 MySQL
```powershell
mysql --version
# 或
mysql -u root -p
```

### 检查 Apache
访问：http://localhost

### 检查 PHP 配置
访问项目中的 `check_php_config.php`：
http://localhost/count168/check_php_config.php

---

## 常见问题

### 1. PHP 扩展未加载
- 检查 `php.ini` 中的 `extension_dir` 路径
- 确保扩展文件存在于该目录
- 取消注释相应的 `extension=` 行

### 2. Apache 无法启动
- 检查端口 80 是否被占用：`netstat -ano | findstr :80`
- 修改 `httpd.conf` 中的端口号

### 3. MySQL 连接失败
- 检查 MySQL 服务是否运行
- 验证 `config.php` 中的数据库凭据
- 确保数据库已创建

### 4. 权限问题
- 确保 Web 服务器有读取项目文件的权限
- Windows 防火墙可能阻止连接

---

## 推荐配置（根据项目需求）

根据 `check_php_config.php` 的推荐值，确保 `php.ini` 包含：

```ini
post_max_size = 64M
upload_max_filesize = 64M
max_input_vars = 5000
max_input_time = 300
max_execution_time = 300
memory_limit = 256M
date.timezone = Asia/Kuala_Lumpur
```

---

## 下一步

1. 选择并安装上述方案之一（推荐 XAMPP 或 Laragon）
2. 导入数据库：`count_fixed.sql` 或 `count.sql`
3. 配置 `config.php` 中的数据库连接
4. 访问项目测试

---

## 快速命令参考

```powershell
# 检查 PHP 版本
php -v

# 检查已安装的 PHP 扩展
php -m

# 检查 PHP 配置文件位置
php --ini

# 检查 MySQL 服务状态
Get-Service -Name "*mysql*"

# 检查 Apache 服务状态
Get-Service -Name "*apache*"
```
