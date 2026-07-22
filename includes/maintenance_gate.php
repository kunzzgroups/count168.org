<?php
/**
 * Global maintenance mode gate.
 *
 * Rules:
 * - When maintenance mode is enabled, only allowlisted IT login_ids may continue.
 * - IT bypass requires user.status = 'active'.
 */

if (!function_exists('maintenance_gate_it_allowlist')) {
    /**
     * Hardcoded IT login_id allowlist.
     *
     * @return string[]
     */
    function maintenance_gate_it_allowlist(): array
    {
        return ['it_jk', 'it_js', 'it_ms'];
    }
}

if (!function_exists('maintenance_gate_it_scope_groups')) {
    /**
     * @return string[]
     */
    function maintenance_gate_it_scope_groups(): array
    {
        return ['AP', 'IG'];
    }
}

if (!function_exists('maintenance_gate_norm_login_id')) {
    function maintenance_gate_norm_login_id(?string $loginId): string
    {
        return strtolower(trim((string) $loginId));
    }
}

if (!function_exists('maintenance_gate_is_allowlisted_login')) {
    function maintenance_gate_is_allowlisted_login(?string $loginId): bool
    {
        $norm = maintenance_gate_norm_login_id($loginId);
        if ($norm === '') {
            return false;
        }
        return in_array($norm, maintenance_gate_it_allowlist(), true);
    }
}

if (!function_exists('maintenance_gate_is_allowlisted_login_db')) {
    function maintenance_gate_is_allowlisted_login_db(PDO $pdo, ?string $loginId): bool
    {
        $norm = strtoupper(trim((string) $loginId));
        if ($norm === '') {
            return false;
        }
        try {
            $stmt = $pdo->prepare(
                "SELECT 1
                 FROM system_it_allowlist
                 WHERE UPPER(TRIM(login_id)) = ?
                   AND enabled = 1
                 LIMIT 1"
            );
            $stmt->execute([$norm]);
            return (bool) $stmt->fetchColumn();
        } catch (Throwable $e) {
            // Table may not exist before migration.
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_is_enabled')) {
    function maintenance_gate_is_enabled(PDO $pdo): bool
    {
        try {
            $stmt = $pdo->query(
                "SELECT maintenance_mode_enabled
                 FROM system_runtime_flags
                 WHERE id = 1
                 LIMIT 1"
            );
            $value = $stmt ? $stmt->fetchColumn() : null;
            return (int) $value === 1;
        } catch (Throwable $e) {
            // Table may not exist before migration; default to disabled.
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_fetch_message')) {
    function maintenance_gate_fetch_message(PDO $pdo): string
    {
        $fallback = 'System is under maintenance. Please try again later.';

        try {
            $stmt = $pdo->query(
                "SELECT maintenance_message_id
                 FROM system_runtime_flags
                 WHERE id = 1
                 LIMIT 1"
            );
            $messageId = (int) ($stmt ? $stmt->fetchColumn() : 0);

            if ($messageId > 0) {
                $msgStmt = $pdo->prepare(
                    "SELECT prefix, content
                     FROM maintenance_marquee
                     WHERE id = ?
                     LIMIT 1"
                );
                $msgStmt->execute([$messageId]);
                $row = $msgStmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $prefix = trim((string) ($row['prefix'] ?? ''));
                    $content = trim((string) ($row['content'] ?? ''));
                    $plain = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                    $message = trim($prefix . ' ' . $plain);
                    if ($message !== '') {
                        return $message;
                    }
                }
            }

            $latestStmt = $pdo->query(
                "SELECT prefix, content
                 FROM maintenance_marquee
                 WHERE company_code = 'C168' AND status = 'active'
                 ORDER BY created_at DESC
                 LIMIT 1"
            );
            $latest = $latestStmt ? $latestStmt->fetch(PDO::FETCH_ASSOC) : null;
            if ($latest) {
                $prefix = trim((string) ($latest['prefix'] ?? ''));
                $content = trim((string) ($latest['content'] ?? ''));
                $plain = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                $message = trim($prefix . ' ' . $plain);
                if ($message !== '') {
                    return $message;
                }
            }
        } catch (Throwable $e) {
            error_log('maintenance_gate_fetch_message failed: ' . $e->getMessage());
        }

        return $fallback;
    }
}

if (!function_exists('maintenance_gate_is_active_user_login')) {
    function maintenance_gate_is_active_user_login(PDO $pdo, ?string $loginId): bool
    {
        $isHardcoded = maintenance_gate_is_allowlisted_login($loginId);
        $isDbAllowlisted = maintenance_gate_is_allowlisted_login_db($pdo, $loginId);
        if (!$isHardcoded && !$isDbAllowlisted) {
            return false;
        }

        $norm = strtoupper(trim((string) $loginId));
        if ($norm === '') {
            return false;
        }

        try {
            $stmt = $pdo->prepare(
                "SELECT 1
                 FROM user
                 WHERE UPPER(TRIM(login_id)) = ?
                   AND status = 'active'
                 LIMIT 1"
            );
            $stmt->execute([$norm]);
            return (bool) $stmt->fetchColumn();
        } catch (Throwable $e) {
            error_log('maintenance_gate_is_active_user_login failed: ' . $e->getMessage());
            return false;
        }
    }
}

if (!function_exists('maintenance_gate_clear_session_state')) {
    function maintenance_gate_clear_session_state(): void
    {
        if (function_exists('session_user_payload_cache_clear')) {
            session_user_payload_cache_clear();
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'] ?: '/',
                    'domain' => $params['domain'] ?: '',
                    'secure' => (bool) ($params['secure'] ?? false),
                    'httponly' => (bool) ($params['httponly'] ?? true),
                    'samesite' => $params['samesite'] ?? 'Lax',
                ]);
            }
            session_destroy();
        }

        if (function_exists('clear_remember_token_cookie')) {
            clear_remember_token_cookie();
        } else {
            setcookie('remember_token', '', time() - 42000, '/');
        }
    }
}

if (!function_exists('maintenance_gate_emit_blocked_response')) {
    /**
     * @return never
     */
    function maintenance_gate_emit_blocked_response(PDO $pdo, bool $isApiRequest): void
    {
        $message = maintenance_gate_fetch_message($pdo);
        maintenance_gate_clear_session_state();

        if ($isApiRequest) {
            if (!headers_sent()) {
                header('Content-Type: application/json; charset=utf-8');
            }
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'status' => 'error',
                'message' => $message,
                'redirect' => '/login',
                'maintenance_mode' => true,
                'data' => null,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $redirect = '/login?maintenance=1';
        if (!headers_sent()) {
            header('Location: ' . $redirect);
        }
        exit;
    }
}

if (!function_exists('maintenance_gate_enforce_active_session')) {
    function maintenance_gate_enforce_active_session(PDO $pdo, bool $isApiRequest): void
    {
        if (!isset($_SESSION['user_id'])) {
            return;
        }
        if (!maintenance_gate_is_enabled($pdo)) {
            return;
        }

        $loginId = (string) ($_SESSION['login_id'] ?? '');
        if (maintenance_gate_is_active_user_login($pdo, $loginId)) {
            return;
        }

        maintenance_gate_emit_blocked_response($pdo, $isApiRequest);
    }
}

if (!function_exists('maintenance_gate_build_login_reject_payload')) {
    function maintenance_gate_build_login_reject_payload(PDO $pdo): array
    {
        return [
            'status' => 'error',
            'message' => maintenance_gate_fetch_message($pdo),
            'maintenance_mode' => true,
        ];
    }
}

if (!function_exists('maintenance_gate_get_c168_company_row')) {
    /**
     * @return array{id:int, company_id:string, group_id:?string}|null
     */
    function maintenance_gate_get_c168_company_row(PDO $pdo): ?array
    {
        try {
            $stmt = $pdo->query(
                "SELECT id, company_id, group_id
                 FROM company
                 WHERE UPPER(TRIM(company_id)) = 'C168'
                 LIMIT 1"
            );
            $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
            if (!$row || !isset($row['id'])) {
                $groups = maintenance_gate_it_scope_groups();
                $placeholders = implode(',', array_fill(0, count($groups), '?'));
                $fallback = $pdo->prepare(
                    "SELECT id, company_id, group_id
                     FROM company
                     WHERE UPPER(TRIM(group_id)) IN ($placeholders)
                     ORDER BY company_id ASC
                     LIMIT 1"
                );
                $fallback->execute($groups);
                $row = $fallback->fetch(PDO::FETCH_ASSOC) ?: null;
            }
            if (!$row || !isset($row['id'])) {
                return null;
            }
            return [
                'id' => (int) $row['id'],
                'company_id' => (string) ($row['company_id'] ?? 'C168'),
                'group_id' => isset($row['group_id']) && trim((string) $row['group_id']) !== ''
                    ? strtoupper(trim((string) $row['group_id']))
                    : null,
            ];
        } catch (Throwable $e) {
            error_log('maintenance_gate_get_c168_company_row failed: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('maintenance_gate_get_company_row_by_id')) {
    /**
     * @return array{id:int, company_id:string, group_id:?string}|null
     */
    function maintenance_gate_get_company_row_by_id(PDO $pdo, int $companyId): ?array
    {
        if ($companyId <= 0) {
            return null;
        }

        try {
            $stmt = $pdo->prepare(
                "SELECT id, company_id, group_id
                 FROM company
                 WHERE id = ?
                 LIMIT 1"
            );
            $stmt->execute([$companyId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row || !isset($row['id'])) {
                return null;
            }

            return [
                'id' => (int) $row['id'],
                'company_id' => (string) ($row['company_id'] ?? ''),
                'group_id' => isset($row['group_id']) && trim((string) $row['group_id']) !== ''
                    ? strtoupper(trim((string) $row['group_id']))
                    : null,
            ];
        } catch (Throwable $e) {
            error_log('maintenance_gate_get_company_row_by_id failed: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('maintenance_gate_is_it_allowed_company_id')) {
    function maintenance_gate_is_it_allowed_company_id(PDO $pdo, int $companyId): bool
    {
        if ($companyId <= 0) {
            return false;
        }

        $row = maintenance_gate_get_company_row_by_id($pdo, $companyId);
        if (!$row) {
            return false;
        }

        $companyCode = strtoupper(trim((string) $row['company_id']));
        if ($companyCode === 'C168') {
            return true;
        }

        $groupId = $row['group_id'] ?? null;
        if ($groupId === null) {
            return false;
        }

        return in_array($groupId, maintenance_gate_it_scope_groups(), true);
    }
}

if (!function_exists('maintenance_gate_apply_it_company_session')) {
    /**
     * @param array{id:int, company_id:string, group_id:?string} $company
     */
    function maintenance_gate_apply_it_company_session(array $company): void
    {
        $_SESSION['company_id'] = (int) $company['id'];
        $_SESSION['company_code'] = (string) $company['company_id'];
        $_SESSION['login_scope'] = 'company';
        $_SESSION['login_identifier'] = (string) $company['company_id'];
        $_SESSION['login_group_id'] = $company['group_id'] ?? null;
        $_SESSION['login_group_scope_id'] = null;
    }
}

if (!function_exists('maintenance_gate_force_it_c168_session')) {
    /**
     * IT 账号：登录或 session 公司不在 AP/IG 范围时锚到 C168；否则保留用户已选公司。
     */
    function maintenance_gate_force_it_c168_session(PDO $pdo): void
    {
        $loginId = (string) ($_SESSION['login_id'] ?? '');
        if (!maintenance_gate_is_allowlisted_login($loginId)) {
            return;
        }

        $currentCompanyId = isset($_SESSION['company_id']) ? (int) $_SESSION['company_id'] : 0;
        if ($currentCompanyId > 0 && maintenance_gate_is_it_allowed_company_id($pdo, $currentCompanyId)) {
            $company = maintenance_gate_get_company_row_by_id($pdo, $currentCompanyId);
            if ($company) {
                maintenance_gate_apply_it_company_session($company);
                return;
            }
        }

        $company = maintenance_gate_get_c168_company_row($pdo);
        if (!$company) {
            return;
        }

        maintenance_gate_apply_it_company_session($company);
    }
}
