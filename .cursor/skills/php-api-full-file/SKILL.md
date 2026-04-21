---
name: php-api-full-file
description: Generate complete PHP API endpoint files for this project. Use when the user asks to create or write an API endpoint, route, or backend API in PHP. Enforce full-file output, /api/v1/{name}.php path, mysqli prepared statements, JSON-only responses, GET/POST handling, server-side validation, no direct DELETE, and soft delete patterns.
---

# PHP API Full File

## When to apply

Apply this skill whenever the user asks to create/update a PHP API endpoint.

Trigger terms include: API, endpoint, route, `/api/v1`, PHP backend, GET/POST, soft delete.

## Mandatory output contract

For every API task, output a **complete PHP file**, not a snippet.

The file must include all of these parts:

1. Database connection (`mysqli`)
2. JSON headers
3. HTTP method handling (`GET` / `POST`)
4. Prepared statements
5. JSON response object

Required response shape:

```json
{
  "success": true,
  "data": {}
}
```

On failure, return（`error` 保留可读信息；`error_code` 供前端 i18n 映射，建议同时返回）:

```json
{
  "success": false,
  "error": "message",
  "error_code": "STABLE_MACHINE_CODE"
}
```

Always return JSON. Never output HTML.

## 双语与数据（后端职责边界）

- **PHP API 不承载页面 UI 文案体系**：按钮、菜单、表单标签等由前端 **i18next**（`zh.json` / `en.json`）维护；接口只返回 **数据结构与校验结果**。
- **库表双语内容**：对用户可见且随语言变化的字段，使用成对列（例如 `title_zh` / `title_en`），查询时用 **prepared statement** 原样 `SELECT`；`data` 中可同时返回两个字段，由前端按当前语言选择展示。
- **`error` 字段**：优先保持简短、可读；若团队约定统一错误码（如 `error_code`）供前端 `t()` 映射，可在具体接口中增加，但须保持 JSON 契约清晰、仍以 `success` / `data` / `error` 为主。

## Required path

Create endpoint files at:

`/api/v1/{name}.php`

Do not place API files in other directories.

## Backend safety rules

1. Validate all inputs on backend.
2. Business rule: amount must be `> 0` where applicable.
3. Must use prepared statements for SQL.
4. Do not use direct `DELETE` SQL statements.
5. Use soft delete pattern instead (for example `is_deleted = 1`, with update metadata if available).

## Method behavior baseline

- `GET`: read/query data with prepared statements.
- `POST`: create/update/soft-delete actions with prepared statements and validation.
- For unsupported methods, return JSON error with proper HTTP status.

## Implementation checklist

Before finalizing any API file, ensure:

- [ ] Full PHP file produced (not partial snippet)
- [ ] Located at `/api/v1/{name}.php`
- [ ] `header('Content-Type: application/json; charset=utf-8');`
- [ ] Uses `mysqli` + prepared statements
- [ ] Handles `GET` and/or `POST` explicitly
- [ ] Backend validation implemented
- [ ] No direct `DELETE`
- [ ] Soft delete used where deletion logic exists
- [ ] JSON response uses `success` and `data`/`error`

## Starter template

```php
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../db.php'; // adjust if project uses another db bootstrap

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // TODO: validate input, query with prepared statement
    respond(200, [
        'success' => true,
        'data' => []
    ]);
}

if ($method === 'POST') {
    // TODO: validate input (e.g. amount > 0), write with prepared statement
    // TODO: soft delete via UPDATE ... SET is_deleted = 1 (no DELETE)
    respond(200, [
        'success' => true,
        'data' => []
    ]);
}

respond(405, [
    'success' => false,
    'error' => 'Method not allowed'
]);
```

## Hard prohibitions

- No snippet-only output for API creation tasks
- No HTML output in PHP API
- No direct SQL `DELETE`
- No non-JSON response body
