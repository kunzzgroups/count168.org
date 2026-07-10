<?php
declare(strict_types=1);

$dsn = 'mysql:host=127.0.0.1;port=13306;dbname=u857194726_c168site;charset=utf8mb4';
$user = 'admin';
$pass = 'C168_site';

$files = [
    __DIR__ . '/../migrations/20260710_maintenance_mode_it_allowlist.sql',
    __DIR__ . '/../migrations/20260710_seed_it_users_for_maintenance.sql',
];

try {
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    foreach ($files as $file) {
        if (!is_file($file)) {
            throw new RuntimeException('Migration file not found: ' . $file);
        }
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('Failed to read migration file: ' . $file);
        }
        $pdo->exec($sql);
        echo '[OK] ' . basename($file) . PHP_EOL;
    }

    echo '[DONE] maintenance migrations applied' . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, '[ERROR] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
