<?php
/**
 * React 侧栏与 classic sidebar.php 的显示条件对齐（C168、公司 category、到期等）
 */
session_start();
header('Content-Type: application/json; charset=utf-8');
ob_start();
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../includes/c168_domain_access.php';
ob_end_clean();

if (!isset($_SESSION['user_id'])) {
    api_error('Unauthorized', 401, ['redirect' => 'index.php']);
    exit;
}

$isMember = isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'member';
$userId = (int) $_SESSION['user_id'];
$role = (string) ($_SESSION['role'] ?? '');
$roleLower = strtolower(trim($role));

$permissions = [];
if (!$isMember) {
    $stmt = $pdo->prepare('SELECT permissions FROM user WHERE id = ?');
    $stmt->execute([$userId]);
    $up = $stmt->fetchColumn();
    $permissions = $up ? (json_decode((string) $up, true) ?: []) : [];
    if (!is_array($permissions)) {
        $permissions = [];
    }
}

$companyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : null;
$isCurrentCompanyC168 = false;
$currentCompanyCode = strtoupper(trim((string) ($_SESSION['company_code'] ?? '')));
if ($currentCompanyCode === 'C168') {
    $isCurrentCompanyC168 = true;
} elseif ($companyId) {
    try {
        $st = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
        $st->execute([$companyId]);
        $isCurrentCompanyC168 = (int) $st->fetchColumn() > 0;
    } catch (PDOException $e) {
        $isCurrentCompanyC168 = false;
    }
}

$hasC168DomainPageAccess = $isCurrentCompanyC168 && userHasC168DomainPageAccess($roleLower);

$companyHasGambling = false;
$companyHasBank = false;
$expiration = null;
if ($companyId) {
    try {
        $st = $pdo->prepare('SELECT permissions, expiration_date FROM company WHERE id = ?');
        $st->execute([$companyId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $pj = $row['permissions'] ?? null;
            if ($pj) {
                $arr = json_decode((string) $pj, true);
                $cats = is_array($arr) ? $arr : [];
                $companyHasGambling = in_array('Games', $cats, true) || in_array('Gambling', $cats, true);
                $companyHasBank = in_array('Bank', $cats, true);
            }
            $ed = $row['expiration_date'] ?? null;
            if ($ed) {
                $now = new DateTime();
                $now->setTime(0, 0, 0);
                $ex = new DateTime((string) $ed);
                $ex->setTime(0, 0, 0);
                $diff = $now->diff($ex);
                $days = (int) $diff->format('%r%a');
                if ($days < 0) {
                    $text = 'Expired';
                    $status = 'expired';
                } elseif ($days === 0) {
                    $text = 'Expires today';
                    $status = 'warning';
                } elseif ($days <= 7) {
                    $text = $days . ' day' . ($days > 1 ? 's' : '') . ' left';
                    $status = 'warning';
                } elseif ($days <= 30) {
                    $text = $days . ' days left';
                    $status = 'normal';
                } else {
                    $m = (int) floor($days / 30);
                    $d = $days % 30;
                    if ($d === 0) {
                        $text = $m . ' month' . ($m > 1 ? 's' : '') . ' left';
                    } else {
                        $text = $m . 'm ' . $d . 'd left';
                    }
                    $status = 'normal';
                }
                $expiration = ['text' => $text, 'status' => $status, 'date' => (string) $ed];
            }
        }
    } catch (PDOException $e) {
        error_log('sidebar_context_api: ' . $e->getMessage());
    }
}

$isExternalView =
    (isset($_SESSION['is_external_view']) && $_SESSION['is_external_view']) ||
    (strtolower($role) === 'partnership' && (!isset($_SESSION['read_only']) || (int) $_SESSION['read_only'] === 1));

api_success([
    'isMember' => $isMember,
    'role' => $role,
    'permissions' => array_values($permissions),
    'hasC168DomainPageAccess' => $hasC168DomainPageAccess,
    'companyHasGambling' => $companyHasGambling,
    'companyHasBank' => $companyHasBank,
    'expiration' => $expiration,
    'isExternalView' => (bool) $isExternalView,
], 'ok');
