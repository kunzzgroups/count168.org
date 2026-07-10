# data_capture_templates：scope_id 回填

从 `.com`（如 `u857194726_c168site`）导入数据到 `c168_org` 后，Formula Maintenance 可能出现「库里有数据、页面显示 No data found」。

**原因：** `.org` 的 Formula Maintenance API 在 company scope 下会过滤 `data_capture_templates.scope_id`。若迁移后 `scope_type = 'company'` 但 `scope_id` 仍为 `NULL`，且账户不是 `AG` / `EXPENSES`，记录会被全部隐藏。

**典型症状：** `ADMIN7FT (WCC)` 在 DBeaver 能查到 36 条，但 `count168.org` 选 IG + AG 后列表为空。

---

## 执行前

1. **确认数据库**：在 DBeaver / phpMyAdmin 中选中目标库（例如 `c168_org`），不要误操作 `.com` 生产库。
2. **备份**（推荐）：
   ```sql
   CREATE TABLE data_capture_templates_scope_backup_YYYYMMDD AS
   SELECT id, company_id, scope_type, scope_id, process_id
   FROM data_capture_templates;
   ```
3. **确认 scope 列存在**：
   ```sql
   SHOW COLUMNS FROM data_capture_templates LIKE 'scope%';
   ```
   应看到 `scope_type`、`scope_id`。若没有，请先执行 `database/migrations/20260528_dual_tenant_company_group.sql`。

---

## 步骤 1：查看影响范围

按 `company_id` 统计 `scope_id` 为空的模板数量：

```sql
SELECT company_id, COUNT(*) AS cnt
FROM data_capture_templates
WHERE scope_id IS NULL AND company_id IS NOT NULL
GROUP BY company_id
ORDER BY cnt DESC;

```

- 若返回多行且 `cnt > 0`，说明需要回填。
- 若返回空，可跳过步骤 2，直接做步骤 3 验证页面是否正常。

---

## 步骤 2：回填 scope_id

将子公司模板的 `scope_id` 设为对应的 `company_id`（全表，不仅 AG）：

```sql
UPDATE data_capture_templates
SET scope_type = 'company',
    scope_id = company_id
WHERE scope_id IS NULL
  AND company_id IS NOT NULL;
```

**说明：**

- 仅更新 `scope_id IS NULL` 的行，不会覆盖已有 `scope_type = 'group'` 的集团账本数据。
- 建议在业务低峰执行；行数较多时可能锁表数秒。

执行后再次运行步骤 1，应无结果（或 `cnt` 均为 0）。

---

## 步骤 3：验证（以 WCC / ADMIN7FT 为例）

以下用 **company_id = 127（AG）**、**process.id = 4410（ADMIN7FT）** 模拟 `.org` Formula Maintenance 的可见性查询。若你的环境 ID 不同，请替换后再执行。

```sql
SELECT COUNT(*) AS visible_count
FROM data_capture_templates dct
INNER JOIN process p
  ON p.company_id = dct.company_id
 AND p.id = 4410
 AND CAST(dct.process_id AS UNSIGNED) = 4410
WHERE dct.company_id = 127
  AND (COALESCE(dct.scope_type, '') = '' OR dct.scope_type = 'company')
  AND (
    (dct.scope_id IS NOT NULL AND dct.scope_id > 0 AND dct.scope_id = dct.company_id)
    OR (
      (dct.scope_id IS NULL OR dct.scope_id = 0)
      AND EXISTS (
        SELECT 1 FROM account a
        WHERE a.id = dct.account_id
          AND UPPER(TRIM(a.account_id)) IN ('AG', 'EXPENSES')
      )
    )
  );
```

**预期：** `visible_count` 与回填前该 process 的模板总数一致（例如 36）。

**页面验证：** 登录 `count168.org` → Maintenance → Formula → Group **IG**、Company **AG**、Process **ADMIN7FT**，应出现公式列表。

---

## 可选：检查其他表

若其他模块（Data Capture、账户等）也有类似问题，可抽查：

```sql
SELECT 'data_capture_templates' AS tbl, COUNT(*) AS null_scope_cnt
FROM data_capture_templates WHERE scope_id IS NULL AND company_id IS NOT NULL
UNION ALL
SELECT 'data_captures', COUNT(*) FROM data_captures WHERE scope_id IS NULL AND company_id IS NOT NULL
UNION ALL
SELECT 'account_company', COUNT(*) FROM account_company WHERE scope_id IS NULL AND company_id IS NOT NULL;
```

对 `data_captures`、`account_company` 等表，同样可用：

```sql
UPDATE <table_name>
SET scope_type = 'company',
    scope_id = company_id
WHERE scope_id IS NULL AND company_id IS NOT NULL;
```

（执行前请分别备份对应表。）

---

## 以后导入数据时

正确顺序：

1. 先跑 dual-tenant migration（`20260528_dual_tenant_company_group.sql`），或确保目标库已有 `scope_type` / `scope_id` 列。
2. 再导入 `.com` 业务数据。
3. **导入完成后立即执行本文步骤 2**，或运行 migration 中自带的 `UPDATE ... SET scope_id = company_id`。

若先 migration、后导入 dump，migration 里的回填不会作用于新导入的行，必须再执行一次步骤 2。

---

## 相关代码

- 过滤逻辑：`api/formula_maintenance/formula_maintenance_scope.php` → `formulaMaintenanceBuildTemplateLedgerFilter()`
- 列表 API：`api/formula_maintenance/list_api.php`
- 初始 migration：`database/migrations/20260528_dual_tenant_company_group.sql`
