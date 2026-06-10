<?php
/**
 * Live ownership table schema helpers (sort_order column).
 */

function ownership_ensure_sort_order_column(PDO $pdo, string $table): void
{
    static $ensured = [];
    if (isset($ensured[$table])) {
        return;
    }
    try {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN sort_order INT NOT NULL DEFAULT 0");
    } catch (Exception $e) {
    }
    $ensured[$table] = true;
}

function ownership_owners_order_by_sql(string $alias = 'co'): string
{
    return "ORDER BY {$alias}.sort_order ASC, {$alias}.id ASC";
}
