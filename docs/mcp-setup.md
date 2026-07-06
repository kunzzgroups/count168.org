# Cursor MCP 配置指南（count168test）

本文说明如何在 Cursor 中为本项目启用 **MCP（Model Context Protocol）**，让 AI Agent 能直接查数据库、看 GitHub、调 API、跑浏览器测试，形成「改代码 → 执行 → 验证 → 修 bug」的闭环。

---

## MCP 是什么？

MCP 是一套开放协议，让 Cursor 的 Agent 能调用**外部工具**，而不只是读写项目文件。

没有 MCP 时，Agent 只能：
- 读/写代码
- 在 Terminal 里跑命令

有了 MCP 后，Agent 还能：
- 直接执行 SQL 查 MySQL
- 读取 GitHub PR、Issue、Actions 状态
- 发 HTTP 请求测试 PHP API
- 用浏览器自动化做端到端验证

---

## 对本项目的好处

| 场景 | 没有 MCP | 有 MCP |
|------|----------|--------|
| 排查数据问题 | 你手动查库，复制结果给 AI | Agent 直接 `SELECT` 看真实数据 |
| 对照 API 逻辑 | 你 Postman 测完再描述 | Agent 自己 POST `/api/...` 看返回 |
| 看 PR / CI | 切到浏览器看 GitHub | Agent 直接读 PR 和检查状态 |
| 验证前端 | 你手动点页面 | Playwright 自动打开页面、填表、截图 |
| 修 bug 闭环 | 多轮人工切换工具 | 一条对话：查库 → 改代码 → build → 再测 |

### 典型工作流

```
Cursor Agent 对话
    ↓
修改 PHP / React 代码
    ↓
Terminal（npm run build、php 脚本）
    ↓
MCP MySQL（查 transactions、account 等表）
    ↓
MCP GitHub（看 PR、Issue、CI）
    ↓
MCP Fetch（调 api/session/login_api.php 等）
    ↓
MCP Playwright（浏览器端到端测试）
    ↓
发现 bug → 回到改代码
```

---

## 本项目已配置的 MCP 服务器

配置文件位置：**`.cursor/mcp.json`**（已在 `.gitignore`，不会提交密钥）

| 名称 | 用途 | 是否需要密钥 |
|------|------|----------------|
| `mysql` | 查询本机 MySQL（`u857194726_c168site`） | 是 |
| `github` | 查看/操作 GitHub 仓库（`kunzzgroups/count168test`） | 是（PAT） |
| `fetch` | HTTP GET/POST，测试 PHP API | 否 |
| `playwright` | 浏览器自动化、截图、E2E 测试 | 否 |

密钥模板：**`.cursor/mcp.env.example`**

---

## 环境要求

- **Cursor** v0.48+（支持 Streamable HTTP / MCP）
- **Node.js** 18+（本机已检测到 `C:\Program Files\nodejs\`）
- **MySQL** 本地可连接（与 `includes/config.php` 一致）
- **GitHub PAT**（Personal Access Token，classic 即可）
- **不需要 Docker**（GitHub MCP 使用官方远程端点）

---

## 配置步骤

### 1. 填写数据库与 GitHub 密钥

编辑 `.cursor/mcp.json`，替换以下占位符：

**MySQL（约第 10 行）：**

```json
"MYSQL_PASS": "你的真实密码"
```

密码与 `includes/config.php` 或 `includes/config.local.php` 中的 `$dbpass` 一致。  
若使用 `config.local.php` 覆盖默认值，以 local 文件为准。

**GitHub（约第 17 行）：**

```json
"Authorization": "Bearer ghp_你的token"
```

生成 Token：https://github.com/settings/tokens → **Generate new token (classic)**  
建议勾选：`repo`（必需）；需要看 Actions 时加 `workflow`。

> 可参考 `.cursor/mcp.env.example` 整理密钥，但最终需写入 `mcp.json` 对应字段。

### 2. 确认 MySQL 已启动

```powershell
mysql -h 127.0.0.1 -u admin -p u857194726_c168site
```

连不上时先修数据库，再启用 MCP。

### 3. 在 Cursor 里启用 MCP

1. `Ctrl + ,` 打开设置
2. 左侧进入 **Tools & MCP**
3. 在 **Installed MCP Servers** 中找到 `mysql`、`github`、`fetch`、`playwright`
4. 将每个服务器右侧开关从 **Disabled** 拨到 **ON**
5. 等待状态变为绿色（Enabled）

### 4. 重载窗口

`Ctrl + Shift + P` → 输入 `Reload Window` → 回车

重载后回到 **Tools & MCP** 再确认四个服务均为绿色。

### 5.（可选）安装 Playwright 浏览器

首次使用 Playwright MCP 时，若报错缺少浏览器：

```powershell
npx playwright install
```

---

## 验证是否配置成功

在 **Agent 模式**下分别尝试：

| 服务器 | 示例提示词 |
|--------|------------|
| mysql | 「列出 `transactions` 表结构」 |
| mysql | 「查 `transactions` 最近 5 条记录」 |
| github | 「列出 kunzzgroups/count168test 最近的 open PR」 |
| fetch | 「GET https://api.github.com/repos/nodejs/node」 |
| playwright | 「打开 http://localhost:5173 并截图」 |

Agent 返回真实数据（而非「我无法访问数据库」）即表示配置成功。

---

## 日常使用示例

```
# 数据 + 代码对照
查 transactions 表里 process_id=123 的记录，对照 api/transactions/submit_api.php 的写入逻辑有没有漏字段

# API 联调
POST 到本地 api/session/login_api.php，用测试账号看返回 JSON

# 完整修 bug 闭环
datacapture 的 SUB TOTAL 显示不对：
1. 查相关数据库记录
2. 改 frontend/src/pages/datacapture/ 逻辑
3. npm run build
4. Playwright 验证粘贴后 subtotal 正确
```

---

## 故障排查

### 开关打开但仍是黄点 / 红点

1. `Ctrl + Shift + U` 打开 **Output**
2. 下拉选择 **MCP Logs**
3. 查看对应服务器报错

### 常见错误

| 错误 / 现象 | 原因 | 处理 |
|-------------|------|------|
| `spawn npx ENOENT` | Cursor 找不到 npx | 确认 `mcp.json` 中 `command` 为 `C:\\Program Files\\nodejs\\npx.cmd` |
| mysql 连接失败 | 密码错或 MySQL 未启动 | 核对 `MYSQL_PASS`，启动 MySQL 服务 |
| github 401 | Token 无效或过期 | 重新生成 PAT，确保 `Bearer ` 后有空格 |
| playwright 超时 | 未装浏览器或 dev server 未开 | 运行 `npx playwright install`；先 `cd frontend && npm run dev` |
| Agent 不用 MCP 工具 | 服务器仍为 Disabled | 在 Tools & MCP 打开开关并重载窗口 |

### 工具太多、回答变慢

Cursor 同时加载过多 MCP 工具会占用上下文。可按需只开启：
- 日常开发：`mysql` + `fetch`
- 提 PR 前：加上 `github`
- E2E 验证：再加上 `playwright`

---

## 安全注意事项

1. **`.cursor/` 已在 `.gitignore`** — `mcp.json` 含密钥时不会进 Git，但仍勿把生产密码提交到仓库。
2. **建议本地 MCP 使用只读数据库账号** — MCP 可执行任意 SQL，生产环境慎用写权限。
3. **GitHub PAT 泄露后立即撤销** — 在 GitHub Settings → Tokens 中删除并重建。
4. **fetch MCP 默认阻止访问内网私有地址** — 测本地 API 时通常仍可用；若被拦截，查看 `@yawlabs/fetch-mcp` 文档中的 `allow_private_hosts` 选项。

---

## 配置文件结构说明

```json
{
  "mcpServers": {
    "mysql": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "mysql-mcp-server@0.1.3"],
      "env": { "MYSQL_HOST": "...", "MYSQL_PASS": "..." }
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ghp_..." }
    },
    "fetch": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "@yawlabs/fetch-mcp@latest"]
    },
    "playwright": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

- **stdio 类型**（mysql、fetch、playwright）：Cursor 用 `npx` 启动本地进程
- **HTTP 类型**（github）：Cursor 连接 GitHub 官方远程 MCP，无需 Docker

---

## 新成员快速上手清单

- [ ] 安装 Node.js 18+
- [ ] 复制 `.cursor/mcp.env.example` 作参考，在 `.cursor/mcp.json` 填入 MySQL 密码与 GitHub PAT
- [ ] 确认本地 MySQL 可连接
- [ ] Cursor → Tools & MCP → 四个服务器全部 **ON**
- [ ] Reload Window
- [ ] Agent 模式下用「查 transactions 表结构」验证

---

## 结论

**MCP 让 Cursor Agent 从「只会改代码」变成「能查真数据、测真接口、看真 PR」的全栈助手。**

对本项目（PHP + MySQL + React）而言：

| 维度 | 结论 |
|------|------|
| **值不值得用** | 值得。排查数据 bug、API 联调、PR 对照时，少你在数据库 / Postman / GitHub 之间来回切 |
| **成本高不高** | MCP 本身免费；只消耗现有 Cursor Pro+ 的 Agent 额度，无额外订阅 |
| **难不难配** | 低。填 `mcp.json` 两处密钥 → Tools & MCP 开开关 → Reload，约 5 分钟 |
| **风险** | 密钥勿提交 Git；生产库建议只读账号；按需开启服务器以省额度 |

**一句话：MCP 不是新工具，是给 Agent 装的「手」—— 查库、调 API、看 GitHub、跑浏览器，都在对话里完成。**

配置完成后，用 Agent 说一句「查库 → 改代码 → build → 验证」即可跑通完整闭环。

---

## 相关链接

- [Cursor MCP 文档](https://cursor.com/docs/context/mcp)
- [GitHub MCP Server 安装说明](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-cursor.md)
- [GitHub Personal Access Tokens](https://github.com/settings/tokens)
- 本项目数据库配置：`includes/config.php`、`includes/config.local.php`
