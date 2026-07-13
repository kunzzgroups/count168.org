<?php
/**
 * Apply submit idempotency + rate_expression columns/indexes.
 *
 * Usage:
 *   php database/scripts/apply_submit_idempotency_migration.php
 *
 * Uses includes/config.php PDO (local or server). For Hostinger without SSH,
 * paste database/migrations/20260713_data_capture_submit_idempotency_and_rate_expression.sql
 * into phpMyAdmin instead.
 */
declare(strict_types=1);

require_once __DIR__ . '/../../includes/config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    fwrite(STDERR, "Database connection unavailable. Check includes/config.php / MySQL.\n");
    exit(1);
}

$sqlFile = __DIR__ . '/../migrations/20260713_data_capture_submit_idempotency_and_rate_expression.sql';
if (!is_file($sqlFile)) {
    fwrite(STDERR, "Missing migration file: {$sqlFile}\n");
    exit(1);
}

$sql = file_get_contents($sqlFile);
if ($sql === false || trim($sql) === '') {
    fwrite(STDERR, "Failed to read migration file\n");
    exit(1);
}

try {
    // Multi-statement script (PREPARE/EXECUTE blocks) — run as a whole.
    $pdo->exec($sql);
    echo "[OK] applied " . basename($sqlFile) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, '[ERROR] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $st = $pdo->prepare(
        'SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1'
    );
    $st->execute([$table, $column]);
    return (bool) $st->fetchColumn();
}

$okSubmit = columnExists($pdo, 'data_captures', 'submit_request_id');
$okRate = columnExists($pdo, 'data_capture_details', 'rate_expression');
echo $okSubmit ? "[OK] data_captures.submit_request_id\n" : "[MISSING] data_captures.submit_request_id\n";
echo $okRate ? "[OK] data_capture_details.rate_expression\n" : "[MISSING] data_capture_details.rate_expression\n";

if (!$okSubmit || !$okRate) {
    exit(1);
}

echo "[DONE] submit idempotency migration verified\n";
