# Deleted log (PHP services)

Moved from `includes/deleted_log*.php`. Used by delete/restore APIs and `deleted_log_list_api.php`.

| File | Role |
|------|------|
| `deleted_log.php` | `deletedLog()` — snapshot row before DELETE |
| `deleted_log_display.php` | List row summary / Acc ID / page labels |
| `deleted_log_entry_sources.php` | Entry-tab filter definitions (SPA source) |
| `deleted_log_page_scope.php` | Company visibility scope for list query |

Frontend: `frontend/src/pages/deletedlog/DeletedLogPage.jsx` → `GET api/deleted_log_list_api.php`.

## Entry tabs ↔ 侧栏页面

Label 对齐 `AuthenticatedLayout` + `dashboardTranslate`（EN / 中）：

| Tab key | 侧栏位置 | Label |
|---------|----------|-------|
| `account` | Account | Account · 账号 |
| `ownership` | Ownership | Ownership · 股权 |
| `process` | Process | Process · 流程 |
| `capture` | Maintenance › Data Capture | Data Capture · 数据采集 |
| `txn_maint` | Maintenance › Transaction | Transaction · 交易 |
| `payment` | Maintenance › Payment | Payment · 支付 |
| `formula` | Maintenance › Formula | Formula · 公式 |
| `bank_maint` | Maintenance › Bank | Bank · 银行 |
| `auto_renew` | Auto Renew | Auto Renew · 自动续费 |
| `marquee` | Announcement | Announcement · 公告 |

**不进 Deleted Log**：Games Process soft-delete（`waiting`）、只写旁路表而无 `deletedLog()` 的路径、Payment History（业务历史非删除审计）。

## 新删除入口 checklist

1. 删前调用 `deletedLog($pdo, $user, $pageTag, $table, $recordId, …)`（表须在白名单）
2. `$pageTag` 固定为该 API 路径（如 `/api/.../delete_api.php`）
3. 把 `$pageTag` 加入 `deleted_log_entry_sources.php` 对应 tab
4. 在 `deleted_log_display_page_label()` 增加用户可读标签
