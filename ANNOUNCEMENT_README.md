# Announcement 功能说明

## 概述
Announcement（公告）功能允许C168公司的owner/admin用户发布系统公告，所有C168用户都可以在dashboard页面查看这些公告。

## 功能特性

1. **权限控制**
   - 只有C168公司的owner/admin用户可以访问公告管理页面
   - 所有C168用户都可以在dashboard查看公告

2. **公告管理**
   - 发布新公告（包含标题和详细内容）
   - 查看已发布的公告列表
   - 删除公告

3. **Dashboard显示**
   - 公告会在dashboard的右上角通知面板中显示
   - 最多显示10条最新的活跃公告
   - 按创建时间倒序排列

## 安装步骤

### 1. 创建数据库表

执行SQL脚本创建announcements表：

```bash
mysql -u your_username -p your_database < create_announcements_table.sql
```

或在phpMyAdmin中导入 `create_announcements_table.sql` 文件。

### 2. 验证表是否创建成功

```sql
SHOW TABLES LIKE 'announcements';
DESCRIBE announcements;
```

## 文件说明

### 数据库文件
- `create_announcements_table.sql` - 创建announcements表的SQL脚本

### 页面文件
- `announcement.php` - 公告管理页面（发布和删除公告）

### API文件
- `announcement_list_api.php` - 获取公告列表API
- `announcement_create_api.php` - 创建公告API
- `announcement_delete_api.php` - 删除公告API
- `announcement_get_dashboard_api.php` - 获取dashboard显示的公告API

### 修改的文件
- `sidebar.php` - 添加了Announcement菜单项（仅C168可见）
- `dashboard.php` - 修改通知面板以显示公告

## 使用方法

### 发布公告

1. 登录系统（必须是C168公司的owner/admin用户）
2. 在侧边栏点击 "Announcement" 菜单
3. 在左侧表单中填写：
   - **标题**：公告标题（最多500字符）
   - **详细内容**：公告的详细内容
4. 点击"发布公告"按钮

### 查看公告

1. 登录系统（C168用户）
2. 在dashboard页面，点击右上角的通知铃铛图标
3. 公告会在通知面板中显示

### 删除公告

1. 进入Announcement管理页面
2. 在右侧公告列表中，找到要删除的公告
3. 点击该公告右侧的"删除"按钮
4. 确认删除操作

## 数据库表结构

```sql
CREATE TABLE announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    company_code VARCHAR(50) NOT NULL DEFAULT 'C168',
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES user(id) ON DELETE RESTRICT
);
```

## 注意事项

1. **权限检查**：只有C168公司的owner/admin用户可以管理公告
2. **标题限制**：公告标题最多500个字符
3. **显示限制**：Dashboard最多显示10条最新公告
4. **删除不可恢复**：删除公告后无法恢复，请谨慎操作

## 故障排除

### 问题：看不到Announcement菜单

**解决方案**：
- 确保你是C168公司的用户
- 确保你的角色是owner或admin
- 检查session中的company_code是否为'C168'

### 问题：无法发布公告

**解决方案**：
- 检查是否已创建announcements表
- 检查数据库连接是否正常
- 查看浏览器控制台的错误信息

### 问题：Dashboard看不到公告

**解决方案**：
- 确保有已发布的活跃公告（status='active'）
- 检查浏览器控制台是否有JavaScript错误
- 确认API文件存在且可访问

