<?php
/**
 * Process List 批量删除（POST ids）。需在已加载 session_check、$pdo、$processListPageFile 的上下文中 require。
 * 与 `processlist_classic.php` 内原逻辑一致。
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['ids'])) {
    try {
        $ids = is_array($_POST['ids']) ? $_POST['ids'] : (isset($_POST['ids']) ? [$_POST['ids']] : []);
        $ids = array_map('intval', array_filter($ids));
        $permission = isset($_POST['permission']) ? trim($_POST['permission']) : '';

        if (!empty($ids)) {
            $company_id_session = $_SESSION['company_id'] ?? null;
            if (!$company_id_session) {
                header('Location: ' . $processListPageFile . '?error=delete_failed');
                exit;
            }

            if ($permission === 'Bank') {
                $placeholders = str_repeat('?,', count($ids) - 1) . '?';
                $stmt = $pdo->prepare("SELECT id FROM bank_process WHERE id IN ($placeholders) AND company_id = ? AND status = 'inactive'");
                $params = array_merge($ids, [$company_id_session]);
                $stmt->execute($params);
                $inactiveIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
                if (empty($inactiveIds)) {
                    header('Location: ' . $processListPageFile . '?error=no_inactive_processes');
                    exit;
                }
                $stmt = $pdo->prepare("SELECT id FROM bank_process WHERE id IN ($placeholders) AND company_id = ? AND status = 'inactive' AND day_start IS NOT NULL");
                $stmt->execute($params);
                $withDayStart = $stmt->fetchAll(PDO::FETCH_COLUMN);
                if (!empty($withDayStart)) {
                    header('Location: ' . $processListPageFile . '?error=bank_has_day_start');
                    exit;
                }
                $hasSourceBankProcessId = false;
                try {
                    $colStmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_id'");
                    $hasSourceBankProcessId = $colStmt && $colStmt->rowCount() > 0;
                } catch (PDOException $e) { /* ignore */
                }
                if ($hasSourceBankProcessId) {
                    $papPlaceholders = str_repeat('?,', count($inactiveIds) - 1) . '?';
                    $stmt = $pdo->prepare("SELECT source_bank_process_id FROM transactions WHERE company_id = ? AND source_bank_process_id IN ($papPlaceholders) LIMIT 1");
                    $stmt->execute(array_merge([$company_id_session], $inactiveIds));
                    if ($stmt->fetch()) {
                        header('Location: ' . $processListPageFile . '?error=process_has_transactions');
                        exit;
                    }
                } else {
                    $papPlaceholders = str_repeat('?,', count($inactiveIds) - 1) . '?';
                    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND process_id IN ($papPlaceholders) LIMIT 1");
                    $stmt->execute(array_merge([$company_id_session], $inactiveIds));
                    if ($stmt->fetch()) {
                        header('Location: ' . $processListPageFile . '?error=process_has_transactions');
                        exit;
                    }
                }
                $delPlaceholders = str_repeat('?,', count($inactiveIds) - 1) . '?';
                $stmt = $pdo->prepare("DELETE FROM bank_process WHERE id IN ($delPlaceholders) AND company_id = ? AND status = 'inactive'");
                $stmt->execute(array_merge($inactiveIds, [$company_id_session]));
                header('Location: ' . $processListPageFile . '?success=deleted');
                exit;
            }

            $placeholders = str_repeat('?,', count($ids) - 1) . '?';
            $stmt = $pdo->prepare("SELECT id, process_id, company_id FROM process WHERE id IN ($placeholders) AND status = 'inactive'");
            $stmt->execute($ids);
            $processesToDelete = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($processesToDelete)) {
                header('Location: ' . $processListPageFile . '?error=no_inactive_processes');
                exit;
            }

            $processIds = array_column($processesToDelete, 'id');
            $processCompanyIds = array_unique(array_column($processesToDelete, 'company_id'));
            $formulaCount = 0;
            if (!empty($processIds)) {
                $idPlaceholders = str_repeat('?,', count($processIds) - 1) . '?';
                $formulaCheckParams = $processIds;
                if (!empty($processCompanyIds)) {
                    $companyPlaceholders = str_repeat('?,', count($processCompanyIds) - 1) . '?';
                    $formulaCheckSql = "SELECT COUNT(*) as count FROM data_capture_templates 
                                        WHERE process_id IN ($idPlaceholders) 
                                        AND company_id IN ($companyPlaceholders)";
                    $formulaCheckParams = array_merge($formulaCheckParams, $processCompanyIds);
                } else {
                    $formulaCheckSql = "SELECT COUNT(*) as count FROM data_capture_templates 
                                        WHERE process_id IN ($idPlaceholders)";
                }
                $stmt = $pdo->prepare($formulaCheckSql);
                $stmt->execute($formulaCheckParams);
                $formulaCount = (int) $stmt->fetch(PDO::FETCH_ASSOC)['count'];
            }

            if ($formulaCount > 0) {
                header('Location: ' . $processListPageFile . '?error=process_linked_to_formula');
                exit;
            }

            $hasProcessIdCol = false;
            try {
                $colStmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'process_id'");
                $hasProcessIdCol = $colStmt && $colStmt->rowCount() > 0;
            } catch (PDOException $e) { /* ignore */
            }
            if ($hasProcessIdCol) {
                $txnPlaceholders = str_repeat('?,', count($processIds) - 1) . '?';
                $stmt = $pdo->prepare("SELECT process_id FROM transactions WHERE process_id IN ($txnPlaceholders) LIMIT 1");
                $stmt->execute($processIds);
                if ($stmt->fetch()) {
                    header('Location: ' . $processListPageFile . '?error=process_has_transactions');
                    exit;
                }
            }

            $deletePlaceholders = str_repeat('?,', count($processIds) - 1) . '?';
            $stmt = $pdo->prepare("DELETE FROM process WHERE id IN ($deletePlaceholders) AND status = 'inactive'");
            $stmt->execute($processIds);
            header('Location: ' . $processListPageFile . '?success=deleted');
            exit;
        }
    } catch (PDOException $e) {
        error_log("Delete process error: " . $e->getMessage());
        header('Location: ' . $processListPageFile . '?error=delete_failed');
        exit;
    }
}
