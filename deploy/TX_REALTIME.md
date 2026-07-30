# App-wide realtime sync（SSE Invalidate Bus）

保存成功后，其他开着相关页面的浏览器经 SSE 收到变更信号，静默重拉数据（约 &lt;1s）。**不推送完整业务行**，客户端按权限自行 refetch。

Transaction Payment 的 `ledger_changed` 仍兼容；新域使用 `domain_changed` + `domain` 字段。

## 组件

| 组件 | 路径 |
|------|------|
| Node SSE hub | `services/tx-realtime/server.mjs` |
| PHP publish（通用） | `api/includes/realtime.php` |
| PHP ledger 兼容包装 | `api/includes/ledger_realtime.php` |
| Ticket API（全站） | `api/realtime/ticket_api.php` |
| Ticket API（TX 旧） | `api/transactions/realtime_ticket_api.php` |
| 前端单连接 | `frontend/src/lib/realtime/AppRealtimeBridge.jsx`（挂在 AuthenticatedLayout） |
| 页面订阅 | `useRealtimeDomain(domain, refetch)` |
| systemd | `deploy/systemd/tx-realtime.service` |

单机 EC2：**可不装 Redis**。多实例时再设 `REDIS_URL`。

## 新人接新功能（checklist）

1. **写 API 成功后**（commit 之后）：

```php
require_once __DIR__ . '/../includes/realtime.php';
realtime_publish_companies([$company_id], 'accounts', 'add');
// 或 realtime_publish_scope($listScope, 'datacapture', 'save');
```

2. **列表页**（若未用 TanStack Query 被 bridge 覆盖）：

```js
useRealtimeDomain(REALTIME_DOMAINS.ACCOUNTS, () => refreshList({ silent: true }));
```

3. Hub / nginx / secret **不用改**。

常用 `domain`：`accounts` | `processes` | `datacapture` | `ledger` | `ownership` | `users` | `maintenance` | `announcements` | `domain`

## EC2 部署

```powershell
powershell -ExecutionPolicy Bypass -File deploy\winscp-deploy-ec2.ps1
```

或远端：

```bash
bash /var/www/count168/deploy/deploy-realtime.sh
curl -s http://127.0.0.1:3911/health
```

`includes/config.local.php` 的 `$tx_realtime_secret` 须与 `services/tx-realtime/.env` 一致。未设置 secret 时 realtime **自动关闭**（业务写不受影响）。

**权限（必查）**：php-fpm 用户 `apache` 须能读 `config.local.php`（`ec2-user:apache` + `640`）。

排障：`/realtime/health` 的 `clients` ≥ 已登录开着 SPA 的浏览器数；access log 应有 `/realtime/sse`。

## 验收（示例）

1. 两浏览器同公司  
2. A 在 Account 新增账号 → B 在 Transaction Payment **不刷新**，To/From 下拉出现新账号  
3. A Submit PAYMENT → B 的 Transaction 列表静默更新  
4. A 改 Process → B 的 Process List 静默更新  
