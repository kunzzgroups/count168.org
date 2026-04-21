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

$ownership_id = $_POST['ownership_id'] ?? null;

if (!$ownership_id) {
    echo json_encode(['status' => 'error', 'message' => 'Missing ownership_id']);
    exit();
}

try {
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
