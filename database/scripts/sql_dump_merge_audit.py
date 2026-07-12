#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple


CREATE_TABLE_RE = re.compile(
    r"^CREATE TABLE(?: IF NOT EXISTS)?\s+(?:(?:`[^`]+`)\.)?`([^`]+)`\s*\($",
    re.IGNORECASE,
)
INSERT_INTO_RE = re.compile(
    r"^INSERT INTO\s+(?:(?:`[^`]+`)\.)?`([^`]+)`\s*(?:\((.*?)\))?\s*VALUES\s*(.*);$",
    re.IGNORECASE | re.DOTALL,
)
DB_NAME_RE = re.compile(r"^-- Database: `([^`]+)`$")
DB_NAME_CREATE_RE = re.compile(r"^CREATE DATABASE(?: IF NOT EXISTS)? `([^`]+)`", re.IGNORECASE)
DB_NAME_USE_RE = re.compile(r"^USE `([^`]+)`", re.IGNORECASE)
PRIMARY_KEY_RE = re.compile(r"PRIMARY KEY \((.+)\)")
UNIQUE_KEY_RE = re.compile(r"UNIQUE KEY `([^`]+)` \((.+)\)")
BACKTICK_NAME_RE = re.compile(r"`([^`]+)`")
SYSTEM_DB_PREFIXES = ("mysql.", "sys.", "performance_schema.", "information_schema.")
ALTER_TABLE_RE = re.compile(
    r"^ALTER TABLE\s+(?:(?:`[^`]+`)\.)?`([^`]+)`\s+(.*);$",
    re.IGNORECASE | re.DOTALL,
)
ADD_PRIMARY_RE = re.compile(r"ADD PRIMARY KEY\s*\((.+?)\)", re.IGNORECASE | re.DOTALL)
ADD_UNIQUE_RE = re.compile(
    r"ADD UNIQUE KEY\s+`([^`]+)`\s*\((.+?)\)",
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class TableSchema:
    name: str
    columns: List[str] = field(default_factory=list)
    primary_key: List[str] = field(default_factory=list)
    unique_keys: Dict[str, List[str]] = field(default_factory=dict)
    create_sql: str = ""


@dataclass
class DumpAnalysis:
    path: Path
    db_name: Optional[str] = None
    tables: Dict[str, TableSchema] = field(default_factory=dict)
    row_counts: Dict[str, int] = field(default_factory=dict)
    pk_rows: Dict[str, Dict[Tuple[str, ...], str]] = field(default_factory=dict)
    duplicate_pks: Dict[str, int] = field(default_factory=dict)
    parse_errors: List[str] = field(default_factory=list)


def normalize_create_sql(sql: str) -> str:
    # Remove noisy AUTO_INCREMENT values so diff focuses on shape.
    cleaned = re.sub(r"AUTO_INCREMENT=\d+", "AUTO_INCREMENT=?", sql)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def split_row_values(row: str) -> List[str]:
    values: List[str] = []
    current: List[str] = []
    in_quote = False
    escape = False
    quote_char = ""

    for ch in row:
        if in_quote:
            current.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote_char:
                in_quote = False
            continue

        if ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            current.append(ch)
            continue

        if ch == ",":
            values.append("".join(current).strip())
            current = []
        else:
            current.append(ch)

    values.append("".join(current).strip())
    return values


def parse_insert_rows(values_blob: str) -> List[str]:
    rows: List[str] = []
    in_quote = False
    escape = False
    quote_char = ""
    depth = 0
    current: List[str] = []

    for ch in values_blob:
        if in_quote:
            current.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote_char:
                in_quote = False
            continue

        if ch in ("'", '"'):
            in_quote = True
            quote_char = ch
            current.append(ch)
            continue

        if ch == "(":
            if depth == 0:
                current = []
            else:
                current.append(ch)
            depth += 1
            continue

        if ch == ")":
            depth -= 1
            if depth == 0:
                rows.append("".join(current))
            else:
                current.append(ch)
            continue

        if depth > 0:
            current.append(ch)

    return rows


def parse_create_table_block(table_name: str, block_lines: List[str]) -> TableSchema:
    schema = TableSchema(name=table_name, create_sql="\n".join(block_lines))
    for raw in block_lines[1:]:
        line = raw.strip().rstrip(",")
        if not line:
            continue
        if line.startswith("`"):
            col_match = BACKTICK_NAME_RE.match(line)
            if col_match:
                schema.columns.append(col_match.group(1))
            continue
        pk_match = PRIMARY_KEY_RE.search(line)
        if pk_match:
            schema.primary_key = BACKTICK_NAME_RE.findall(pk_match.group(1))
            continue
        uk_match = UNIQUE_KEY_RE.search(line)
        if uk_match:
            schema.unique_keys[uk_match.group(1)] = BACKTICK_NAME_RE.findall(uk_match.group(2))
            continue
    return schema


def parse_dump(path: Path) -> DumpAnalysis:
    analysis = DumpAnalysis(path=path)
    _scan_dump_pass(path, analysis, collect_schema=True, collect_data=False)
    _scan_dump_pass(path, analysis, collect_schema=False, collect_data=True)
    if not analysis.db_name:
        analysis.db_name = guess_db_name_from_filename(path)
    return analysis


def guess_db_name_from_filename(path: Path) -> str:
    stem = path.stem
    m = re.match(r"^dump-([A-Za-z0-9_]+)-\d{8,}$", stem)
    if m:
        return m.group(1)
    m = re.match(r"^([A-Za-z0-9_]+)", stem)
    if m:
        return m.group(1)
    return stem


def _scan_dump_pass(path: Path, analysis: DumpAnalysis, collect_schema: bool, collect_data: bool) -> None:
    current_create_table: Optional[str] = None
    create_block: List[str] = []

    # Handles rare multi-line INSERT statements.
    pending_insert: Optional[str] = None
    pending_alter: Optional[str] = None
    current_delimiter = ";"

    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line_no, raw_line in enumerate(f, start=1):
            line = raw_line.rstrip("\n")

            line_stripped = line.strip()
            if line_stripped.upper().startswith("DELIMITER "):
                current_delimiter = line_stripped.split(maxsplit=1)[1].strip()
                continue

            db_match = DB_NAME_RE.match(line_stripped)
            if db_match and not analysis.db_name:
                analysis.db_name = db_match.group(1)
            db_create_match = DB_NAME_CREATE_RE.match(line_stripped)
            if db_create_match and not analysis.db_name:
                analysis.db_name = db_create_match.group(1)
            db_use_match = DB_NAME_USE_RE.match(line_stripped)
            if db_use_match and not analysis.db_name:
                analysis.db_name = db_use_match.group(1)

            if pending_insert is not None:
                pending_insert += "\n" + line
                if line.strip().endswith(";"):
                    if collect_data:
                        _parse_insert_statement(analysis, pending_insert, line_no)
                    pending_insert = None
                continue

            if pending_alter is not None:
                pending_alter += "\n" + line
                if line.strip().endswith(";"):
                    if collect_schema:
                        _parse_alter_statement(analysis, pending_alter, line_no)
                    pending_alter = None
                continue

            if current_create_table is not None:
                create_block.append(line)
                if line.strip().startswith(")") and line.strip().endswith(";"):
                    if collect_schema:
                        schema = parse_create_table_block(current_create_table, create_block)
                        analysis.tables[current_create_table] = schema
                    current_create_table = None
                    create_block = []
                continue

            create_match = CREATE_TABLE_RE.match(line_stripped)
            if create_match and collect_schema:
                current_create_table = create_match.group(1)
                create_block = [line]
                continue

            if current_delimiter == ";" and line_stripped.startswith("INSERT INTO `"):
                if line.strip().endswith(";"):
                    if collect_data:
                        _parse_insert_statement(analysis, line, line_no)
                else:
                    pending_insert = line
                continue

            if current_delimiter == ";" and line_stripped.upper().startswith("ALTER TABLE "):
                if line.strip().endswith(";"):
                    if collect_schema:
                        _parse_alter_statement(analysis, line, line_no)
                else:
                    pending_alter = line


def _parse_insert_statement(analysis: DumpAnalysis, stmt: str, line_no: int) -> None:
    m = INSERT_INTO_RE.match(stmt.strip())
    if not m:
        analysis.parse_errors.append(f"Line {line_no}: cannot parse INSERT header")
        return

    table_name = m.group(1)
    if table_name.startswith(SYSTEM_DB_PREFIXES):
        return

    schema = analysis.tables.get(table_name)
    if not schema:
        # Unknown schema: skip row-level analysis, but keep track.
        analysis.parse_errors.append(f"Line {line_no}: table schema not found for `{table_name}`")
        return

    insert_cols_blob = m.group(2)
    values_blob = m.group(3)

    if insert_cols_blob:
        insert_cols = BACKTICK_NAME_RE.findall(insert_cols_blob)
    else:
        insert_cols = schema.columns

    rows = parse_insert_rows(values_blob)
    if not rows:
        return

    analysis.row_counts[table_name] = analysis.row_counts.get(table_name, 0) + len(rows)

    if not schema.primary_key:
        return

    pk_indices: List[int] = []
    for pk_col in schema.primary_key:
        try:
            pk_indices.append(insert_cols.index(pk_col))
        except ValueError:
            analysis.parse_errors.append(
                f"Line {line_no}: pk column `{pk_col}` not found in INSERT for `{table_name}`"
            )
            return

    table_pk_map = analysis.pk_rows.setdefault(table_name, {})
    dup_count = analysis.duplicate_pks.get(table_name, 0)

    for row in rows:
        values = split_row_values(row)
        if any(idx >= len(values) for idx in pk_indices):
            analysis.parse_errors.append(
                f"Line {line_no}: values shorter than pk indices for `{table_name}`"
            )
            continue
        pk_tuple = tuple(values[idx] for idx in pk_indices)
        canonical_row = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
        row_hash = hashlib.sha1(canonical_row.encode("utf-8", errors="replace")).hexdigest()
        if pk_tuple in table_pk_map:
            dup_count += 1
        else:
            table_pk_map[pk_tuple] = row_hash

    analysis.duplicate_pks[table_name] = dup_count


def _parse_alter_statement(analysis: DumpAnalysis, stmt: str, line_no: int) -> None:
    m = ALTER_TABLE_RE.match(stmt.strip())
    if not m:
        return
    table_name = m.group(1)
    actions = m.group(2)

    schema = analysis.tables.get(table_name)
    if not schema:
        return

    pk_match = ADD_PRIMARY_RE.search(actions)
    if pk_match:
        schema.primary_key = BACKTICK_NAME_RE.findall(pk_match.group(1))

    for uk_match in ADD_UNIQUE_RE.finditer(actions):
        uk_name = uk_match.group(1)
        uk_cols = BACKTICK_NAME_RE.findall(uk_match.group(2))
        if uk_cols:
            schema.unique_keys[uk_name] = uk_cols


def compare_dumps(src: DumpAnalysis, tgt: DumpAnalysis) -> dict:
    src_tables = set(src.tables.keys())
    tgt_tables = set(tgt.tables.keys())
    common_tables = sorted(src_tables & tgt_tables)

    only_in_src = sorted(src_tables - tgt_tables)
    only_in_tgt = sorted(tgt_tables - src_tables)

    schema_diffs = []
    column_set_diff_details = []
    for t in common_tables:
        s_norm = normalize_create_sql(src.tables[t].create_sql)
        t_norm = normalize_create_sql(tgt.tables[t].create_sql)
        if s_norm != t_norm:
            schema_diffs.append(t)
        src_cols_set = set(src.tables[t].columns)
        tgt_cols_set = set(tgt.tables[t].columns)
        if src_cols_set != tgt_cols_set:
            column_set_diff_details.append(
                {
                    "table": t,
                    "source_only_columns": sorted(src_cols_set - tgt_cols_set),
                    "target_only_columns": sorted(tgt_cols_set - src_cols_set),
                }
            )

    table_data_conflicts = []
    for t in common_tables:
        src_schema = src.tables[t]
        tgt_schema = tgt.tables[t]
        if not src_schema.primary_key or not tgt_schema.primary_key:
            continue
        if src_schema.primary_key != tgt_schema.primary_key:
            continue

        src_pk_map = src.pk_rows.get(t, {})
        tgt_pk_map = tgt.pk_rows.get(t, {})
        if not src_pk_map and not tgt_pk_map:
            continue

        src_keys = set(src_pk_map.keys())
        tgt_keys = set(tgt_pk_map.keys())
        overlap = src_keys & tgt_keys
        same_hash = 0
        diff_hash = 0
        for pk in overlap:
            if src_pk_map[pk] == tgt_pk_map[pk]:
                same_hash += 1
            else:
                diff_hash += 1

        table_data_conflicts.append(
            {
                "table": t,
                "pk": src_schema.primary_key,
                "source_rows": src.row_counts.get(t, 0),
                "target_rows": tgt.row_counts.get(t, 0),
                "source_only_pk": len(src_keys - tgt_keys),
                "target_only_pk": len(tgt_keys - src_keys),
                "same_pk_same_data": same_hash,
                "same_pk_diff_data": diff_hash,
                "source_duplicate_pk": src.duplicate_pks.get(t, 0),
                "target_duplicate_pk": tgt.duplicate_pks.get(t, 0),
            }
        )

    table_data_conflicts.sort(key=lambda x: (x["same_pk_diff_data"], x["same_pk_same_data"]), reverse=True)

    return {
        "source_db": src.db_name,
        "target_db": tgt.db_name,
        "only_in_source": only_in_src,
        "only_in_target": only_in_tgt,
        "schema_diff_tables": schema_diffs,
        "column_set_diff_details": column_set_diff_details,
        "table_data_conflicts": table_data_conflicts,
        "source_parse_errors": src.parse_errors[:100],
        "target_parse_errors": tgt.parse_errors[:100],
    }


def generate_merge_sql(src: DumpAnalysis, tgt: DumpAnalysis, compare: dict) -> str:
    src_db = compare.get("source_db") or "source_db"
    tgt_db = compare.get("target_db") or "target_db"
    target_tables = set(tgt.tables.keys())

    lines: List[str] = []
    lines.append("-- Bidirectional preserve merge script")
    lines.append("-- Strategy: keep target as priority, insert source rows with INSERT IGNORE.")
    lines.append("-- For same PK:")
    lines.append("--   - same row data => naturally skipped")
    lines.append("--   - different row data => skipped (target keeps existing row)")
    lines.append("--")
    lines.append(f"-- Source DB: `{src_db}`")
    lines.append(f"-- Target DB: `{tgt_db}`")
    lines.append("")
    lines.append("SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;")
    lines.append("SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;")
    lines.append("SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';")
    lines.append("SET AUTOCOMMIT=0;")
    lines.append("START TRANSACTION;")
    lines.append("SAVEPOINT merge_begin;")
    lines.append("")
    lines.append(f"USE `{tgt_db}`;")
    lines.append("")
    lines.append("CREATE TABLE IF NOT EXISTS `merge_conflict_log` (")
    lines.append("  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,")
    lines.append("  `table_name` VARCHAR(128) NOT NULL,")
    lines.append("  `pk_json` JSON NOT NULL,")
    lines.append("  `logged_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,")
    lines.append("  PRIMARY KEY (`id`)")
    lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;")
    lines.append("")

    skipped: List[str] = []
    merged: List[str] = []

    for table_name, src_schema in src.tables.items():
        if table_name.startswith(SYSTEM_DB_PREFIXES):
            skipped.append(f"{table_name} (system schema)")
            continue
        if table_name not in target_tables:
            skipped.append(f"{table_name} (missing in target)")
            continue
        tgt_schema = tgt.tables.get(table_name)
        if not tgt_schema:
            skipped.append(f"{table_name} (missing in target)")
            continue
        if not src_schema.primary_key or not tgt_schema.primary_key:
            skipped.append(f"{table_name} (no primary key)")
            continue
        if src_schema.primary_key != tgt_schema.primary_key:
            skipped.append(f"{table_name} (primary key differs)")
            continue

        src_cols_set = set(src_schema.columns)
        tgt_cols_set = set(tgt_schema.columns)
        if src_cols_set != tgt_cols_set:
            skipped.append(f"{table_name} (column set differs)")
            continue

        cols = tgt_schema.columns
        if not cols:
            skipped.append(f"{table_name} (cannot parse columns)")
            continue

        pk_cols = src_schema.primary_key
        join_clause = " AND ".join([f"t.`{c}` <=> s.`{c}`" for c in pk_cols])
        all_equal_clause = " AND ".join([f"t.`{c}` <=> s.`{c}`" for c in cols])
        pk_json = "JSON_OBJECT(" + ", ".join([f"'{c}', s.`{c}`" for c in pk_cols]) + ")"

        quoted_cols = ", ".join([f"`{c}`" for c in cols])
        src_cols = ", ".join([f"s.`{c}`" for c in cols])

        lines.append(f"-- Table `{table_name}`")
        lines.append("SAVEPOINT before_" + table_name.replace("-", "_"))
        lines.append("INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)")
        lines.append("SELECT")
        lines.append(f"  '{table_name}' AS table_name,")
        lines.append(f"  {pk_json} AS pk_json")
        lines.append(f"FROM `{src_db}`.`{table_name}` s")
        lines.append(f"JOIN `{tgt_db}`.`{table_name}` t ON {join_clause}")
        lines.append(f"WHERE NOT ({all_equal_clause});")
        lines.append("")
        lines.append(f"INSERT IGNORE INTO `{tgt_db}`.`{table_name}` ({quoted_cols})")
        lines.append(f"SELECT {src_cols}")
        lines.append(f"FROM `{src_db}`.`{table_name}` s;")
        lines.append("")
        merged.append(table_name)

    lines.append("-- Optional but recommended for .com -> .org imports:")
    lines.append("-- Backfill scope_id on data_capture_templates to avoid Formula Maintenance hidden rows.")
    lines.append("CREATE TABLE IF NOT EXISTS `data_capture_templates_scope_backup_merge` AS")
    lines.append("SELECT `id`, `company_id`, `scope_type`, `scope_id`, `process_id`")
    lines.append("FROM `data_capture_templates`;")
    lines.append("")
    lines.append("UPDATE `data_capture_templates`")
    lines.append("SET `scope_type` = 'company',")
    lines.append("    `scope_id` = `company_id`")
    lines.append("WHERE `scope_id` IS NULL")
    lines.append("  AND `company_id` IS NOT NULL;")
    lines.append("")
    lines.append("-- Post-backfill quick check (should be 0 rows in most cases):")
    lines.append("SELECT `company_id`, COUNT(*) AS cnt")
    lines.append("FROM `data_capture_templates`")
    lines.append("WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL")
    lines.append("GROUP BY `company_id`")
    lines.append("ORDER BY cnt DESC;")
    lines.append("")

    lines.append("-- Review conflict rows before COMMIT:")
    lines.append("SELECT `table_name`, COUNT(*) AS conflict_count")
    lines.append("FROM `merge_conflict_log`")
    lines.append("GROUP BY `table_name`")
    lines.append("ORDER BY conflict_count DESC;")
    lines.append("")
    lines.append("-- If conflict_count is acceptable:")
    lines.append("COMMIT;")
    lines.append("-- If not acceptable, rollback instead:")
    lines.append("-- ROLLBACK TO SAVEPOINT merge_begin;")
    lines.append("-- ROLLBACK;")
    lines.append("")
    lines.append("SET SQL_MODE=@OLD_SQL_MODE;")
    lines.append("SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;")
    lines.append("SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;")

    lines.append("")
    lines.append("-- Metadata:")
    lines.append("-- Merged tables: " + str(len(merged)))
    lines.append("-- Skipped tables: " + str(len(skipped)))
    for item in skipped[:200]:
        lines.append("--   skip: " + item)

    return "\n".join(lines) + "\n"


def write_report(compare: dict, out_md: Path) -> None:
    lines: List[str] = []
    lines.append("# SQL Merge Conflict Report")
    lines.append("")
    lines.append(f"- Source DB: `{compare.get('source_db')}`")
    lines.append(f"- Target DB: `{compare.get('target_db')}`")
    lines.append("")

    lines.append("## Structure Diff")
    lines.append("")
    lines.append(f"- Tables only in source: **{len(compare['only_in_source'])}**")
    lines.append(f"- Tables only in target: **{len(compare['only_in_target'])}**")
    lines.append(f"- Tables with schema difference: **{len(compare['schema_diff_tables'])}**")
    lines.append("")

    if compare["schema_diff_tables"]:
        lines.append("### Schema-different tables")
        for t in compare["schema_diff_tables"]:
            lines.append(f"- `{t}`")
        lines.append("")

    if compare["column_set_diff_details"]:
        lines.append("### Column-set differences (auto-merge skipped)")
        lines.append("")
        for item in compare["column_set_diff_details"]:
            lines.append(
                f"- `{item['table']}`: source_only={item['source_only_columns']}, target_only={item['target_only_columns']}"
            )
        lines.append("")

    lines.append("## Data Key Conflict (Primary Key)")
    lines.append("")
    lines.append("| table | pk | source_rows | target_rows | source_only_pk | target_only_pk | same_pk_same_data | same_pk_diff_data |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|")

    for row in compare["table_data_conflicts"]:
        lines.append(
            f"| `{row['table']}` | `{','.join(row['pk'])}` | {row['source_rows']} | {row['target_rows']} | "
            f"{row['source_only_pk']} | {row['target_only_pk']} | {row['same_pk_same_data']} | {row['same_pk_diff_data']} |"
        )
    lines.append("")

    high_risk = [x for x in compare["table_data_conflicts"] if x["same_pk_diff_data"] > 0]
    lines.append("## High-Risk Tables")
    lines.append("")
    lines.append(f"- same_pk_diff_data > 0 tables: **{len(high_risk)}**")
    for x in high_risk[:100]:
        lines.append(f"- `{x['table']}`: {x['same_pk_diff_data']}")
    lines.append("")

    if compare["source_parse_errors"] or compare["target_parse_errors"]:
        lines.append("## Parse Warnings")
        lines.append("")
        lines.append(f"- Source parse warnings: {len(compare['source_parse_errors'])}")
        lines.append(f"- Target parse warnings: {len(compare['target_parse_errors'])}")
        lines.append("")

    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit two MySQL dump files for safe merge.")
    parser.add_argument("--source", required=True, help="Source dump (.sql)")
    parser.add_argument("--target", required=True, help="Target dump (.sql)")
    parser.add_argument("--out-dir", required=True, help="Output directory")
    args = parser.parse_args()

    source_path = Path(args.source)
    target_path = Path(args.target)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    src = parse_dump(source_path)
    tgt = parse_dump(target_path)
    compare = compare_dumps(src, tgt)

    report_md = out_dir / "merge_conflict_report.md"
    merge_sql = out_dir / "merge_bidirectional_skip_same.sql"
    compare_json = out_dir / "merge_conflict_raw.json"

    write_report(compare, report_md)
    merge_sql.write_text(generate_merge_sql(src, tgt, compare), encoding="utf-8")
    compare_json.write_text(json.dumps(compare, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Report: {report_md}")
    print(f"Merge SQL: {merge_sql}")
    print(f"Raw JSON: {compare_json}")


if __name__ == "__main__":
    main()
