<?php
require_once '../../includes/session_check.php';
require_once '../../includes/config.php';
require_once __DIR__ . '/../deleted_log/deleted_log.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
    exit();
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
    exit();
}

$ownership_id = $_POST['ownership_id'] ?? null;

if (!$ownership_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing ownership_id']);
    exit();
}

try {
    deletedLog(
        $pdo,
        (string) ($_SESSION['login_id'] ?? $_SESSION['name'] ?? ''),
        basename(__FILE__),
        'company_ownership',
        (string) $ownership_id
    );
    $stmt = $pdo->prepare("DELETE FROM company_ownership WHERE id = ?");
    $stmt->execute([$ownership_id]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Owner removed successfully'
    ]);
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
?>
