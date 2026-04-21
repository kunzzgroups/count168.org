<?php
require_once '../../session_check.php';
require_once '../../config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$company_id = $_POST['company_id'] ?? null;
$account_id = $_POST['account_id'] ?? null;
$percentage = $_POST['percentage'] ?? null;

if (!$company_id || !$account_id || $percentage === null) {
    echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
    exit();
}

$percentage = (float)$percentage;

if ($percentage <= 0 || $percentage > 100) {
    echo json_encode(['status' => 'error', 'message' => 'Percentage must be between 0 and 100']);
    exit();
}

try {
    $pdo->beginTransaction();

    // Sum existing percentages for this company, EXCEPT the account we are updating (if it already exists)
    $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(percentage), 0) as total 
        FROM company_ownership 
        WHERE company_id = ? AND account_id != ?
    ");
    $stmt->execute([$company_id, $account_id]);
    $currentTotal = (float)$stmt->fetchColumn();

    if ($currentTotal + $percentage > 100) {
        $allowed = 100 - $currentTotal;
        echo json_encode([
            'status' => 'error', 
            'message' => 'Cannot assign percentage. Total would exceed 100%. Maximum allowed for this account is ' . number_format($allowed, 2) . '%.'
        ]);
        $pdo->rollBack();
        exit();
    }

    // Insert or update
    $stmt = $pdo->prepare("
        INSERT INTO company_ownership (company_id, account_id, percentage)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE percentage = ?
    ");
    $stmt->execute([$company_id, $account_id, $percentage, $percentage]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Ownership saved successfully'
    ]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
