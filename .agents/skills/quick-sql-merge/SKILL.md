---
name: quick-sql-merge
description: Fast merge workflow for two MySQL/MariaDB dump files in this repo. Use when user asks to merge source dump into c168_org, generate conflict report, and produce executable merge SQL with rollback safety.
disable-model-invocation: true
---

# Quick SQL Merge

Use this skill to quickly merge one SQL dump into another with conflict visibility and rollback safety.

## Inputs

- Source dump path (example: `C:/Users/.../u857194726_count168 (26).sql`)
- Target dump path (example: `C:/Users/.../dump-c168_org-202607091448.sql`)
- Output directory (example: `database/ops/sql-merge-audit-YYYYMMDD`)

## Workflow

1. Confirm both dump files exist.
2. Run:

```bash
python "database/scripts/sql_dump_merge_audit.py" --source "<source_dump>" --target "<target_dump>" --out-dir "<out_dir>"
```

3. Read and summarize:
   - `<out_dir>/merge_conflict_report.md`
   - `<out_dir>/merge_bidirectional_skip_same.sql`
4. Highlight:
   - `same_pk_diff_data > 0` tables
   - `source_only_pk` totals
   - skipped tables and skip reasons
5. Ask user before production execution if high-risk tables exist.

## Generated Artifacts

- `merge_conflict_report.md`: human-readable conflict report
- `merge_bidirectional_skip_same.sql`: executable merge SQL
- `merge_conflict_raw.json`: machine-readable details

## Merge Policy (default)

- Keep target rows on same PK conflict
- Insert source-only rows with `INSERT IGNORE`
- Log same-PK-different-data rows into `merge_conflict_log`
- Use transaction + savepoint for rollback
- Exclude system schemas (`mysql.*`, `sys.*`, `performance_schema.*`, `information_schema.*`)

## Scope Backfill Rule

After merge, run `data_capture_templates.scope_id` backfill (already included in generated SQL):

- Backup current template scope fields
- `UPDATE data_capture_templates SET scope_type='company', scope_id=company_id WHERE scope_id IS NULL AND company_id IS NOT NULL`
- Recheck null scope count

Reference: `database/ops/SCOPE_ID_BACKFILL_DATA_CAPTURE_TEMPLATES.md`

## Response Template

Use this concise format:

```markdown
- 报告文件：`<out_dir>/merge_conflict_report.md`
- 可执行 SQL：`<out_dir>/merge_bidirectional_skip_same.sql`
- 关键冲突表：`tableA(n)`, `tableB(n)`
- 新增可并入行数：`<sum_source_only_pk>`
- 跳过表：`tableX(reason)`, `tableY(reason)`
- 风险结论：可直接执行 / 需先人工确认
```
