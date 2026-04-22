<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/bootstrap.php';

function detect_lang(array $body): string
{
    $lang = strtolower(trim((string) ($body['lang'] ?? '')));
    if ($lang === 'zh' || $lang === 'en') {
        return $lang;
    }

    $header = (string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '');
    if ($header !== '' && stripos($header, 'en') === 0) {
        return 'en';
    }
    return 'zh';
}

function tr(string $lang, string $zh, string $en): string
{
    return $lang === 'en' ? $en : $zh;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = read_json_body();
$lang = detect_lang($body);

if ($method !== 'POST') {
    respond_json(405, [
        'success' => false,
        'error' => tr($lang, '仅支持 POST', 'Only POST is allowed'),
        'error_code' => 'HTTP_METHOD_NOT_ALLOWED',
    ]);
}

$username = isset($body['username']) ? trim((string) $body['username']) : '';
$password = isset($body['password']) ? (string) $body['password'] : '';

if ($username === '' || $password === '') {
    respond_json(400, [
        'success' => false,
        'error' => tr($lang, '请输入用户名和密码', 'Please enter username and password'),
        'error_code' => 'LOGIN_MISSING_FIELDS',
    ]);
}

if (strlen($username) > 191 || strlen($password) > 500) {
    respond_json(400, [
        'success' => false,
        'error' => tr($lang, '参数长度无效', 'Invalid parameter length'),
        'error_code' => 'LOGIN_PARAM_LENGTH',
    ]);
}

$mysqli = mysqli_bootstrap();

// ---------- User（admin 等，login_id） ----------
$sqlUser = <<<'SQL'
SELECT
    u.id,
    u.login_id,
    u.password,
    u.role,
    c.id AS company_numeric_id,
    c.company_id AS company_code,
    c.expiration_date
FROM user u
INNER JOIN user_company_map ucm ON u.id = ucm.user_id
INNER JOIN company c ON ucm.company_id = c.id
WHERE u.login_id = ? AND u.status = 'active'
SQL;

$stmtUser = $mysqli->prepare($sqlUser);
if ($stmtUser === false) {
    respond_json(500, [
        'success' => false,
        'error' => tr($lang, '查询准备失败', 'Server could not prepare the query'),
        'error_code' => 'LOGIN_DB_PREPARE',
    ]);
}
$stmtUser->bind_param('s', $username);
$stmtUser->execute();
$resultUser = $stmtUser->get_result();
$rowsUser = $resultUser->fetch_all(MYSQLI_ASSOC);
$stmtUser->close();

$matchedUser = null;
$userPasswordMatch = false;
$userHasExpired = false;

foreach ($rowsUser as $row) {
    if (!password_verify($password, (string) $row['password'])) {
        continue;
    }
    $userPasswordMatch = true;
    if (is_company_expired_or_unset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
        $userHasExpired = true;
        continue;
    }
    $matchedUser = $row;
    break;
}

if ($matchedUser !== null) {
    $upd = $mysqli->prepare('UPDATE user SET last_login = NOW() WHERE id = ?');
    if ($upd instanceof mysqli_stmt) {
        $uid = (int) $matchedUser['id'];
        $upd->bind_param('i', $uid);
        $upd->execute();
        $upd->close();
    }

    $role = (string) ($matchedUser['role'] ?? 'user');
    $companyId = (int) $matchedUser['company_numeric_id'];
    $userId = (int) $matchedUser['id'];
    $loginId = (string) $matchedUser['login_id'];

    $token = api_token_create([
        'typ' => 'user',
        'uid' => $userId,
        'role' => $role,
        'cid' => $companyId,
        'login' => $loginId,
    ]);

    respond_json(200, [
        'success' => true,
        'data' => [
            'user' => [
                'id' => $userId,
                'username' => $loginId,
                'role' => $role,
            ],
            'token' => $token,
        ],
    ]);
}

if ($userPasswordMatch && $userHasExpired) {
    respond_json(403, [
        'success' => false,
        'error' => tr($lang, '公司已到期或未设置到期日，无法登录', 'Company subscription is expired or not set; sign-in is blocked'),
        'error_code' => 'LOGIN_COMPANY_EXPIRED',
    ]);
}

// ---------- Owner（owner_code） ----------
$sqlOwner = <<<'SQL'
SELECT
    o.id,
    o.owner_code,
    o.password,
    o.name,
    c.id AS company_numeric_id,
    c.company_id AS company_code,
    c.expiration_date
FROM owner o
INNER JOIN company c ON c.owner_id = o.id
WHERE UPPER(o.owner_code) = UPPER(?)
SQL;

$stmtOwner = $mysqli->prepare($sqlOwner);
if ($stmtOwner === false) {
    respond_json(500, [
        'success' => false,
        'error' => tr($lang, '查询准备失败', 'Server could not prepare the query'),
        'error_code' => 'LOGIN_DB_PREPARE',
    ]);
}
$stmtOwner->bind_param('s', $username);
$stmtOwner->execute();
$resOwner = $stmtOwner->get_result();
$rowsOwner = $resOwner->fetch_all(MYSQLI_ASSOC);
$stmtOwner->close();

$matchedOwner = null;
$ownerPasswordMatch = false;
$ownerHasExpired = false;
$ownerNeedsPlaintextUpgrade = false;

foreach ($rowsOwner as $row) {
    $hash = (string) $row['password'];
    $pwdOk = false;
    $plainForThisRow = false;
    if (password_verify($password, $hash)) {
        $pwdOk = true;
    } elseif ($password === $hash) {
        $pwdOk = true;
        $plainForThisRow = true;
    }
    if (!$pwdOk) {
        continue;
    }
    $ownerPasswordMatch = true;
    if (is_company_expired_or_unset($row['expiration_date'] ?? null, $row['company_code'] ?? null)) {
        $ownerHasExpired = true;
        continue;
    }
    $matchedOwner = $row;
    $ownerNeedsPlaintextUpgrade = $plainForThisRow;
    break;
}

if ($matchedOwner !== null && $ownerNeedsPlaintextUpgrade) {
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    $up = $mysqli->prepare('UPDATE owner SET password = ? WHERE id = ?');
    if ($up instanceof mysqli_stmt) {
        $oid = (int) $matchedOwner['id'];
        $up->bind_param('si', $newHash, $oid);
        $up->execute();
        $up->close();
    }
}

if ($matchedOwner !== null) {
    $ownerId = (int) $matchedOwner['id'];
    $ownerCode = (string) $matchedOwner['owner_code'];
    $companyId = (int) $matchedOwner['company_numeric_id'];

    $token = api_token_create([
        'typ' => 'owner',
        'uid' => $ownerId,
        'role' => 'owner',
        'cid' => $companyId,
        'login' => $ownerCode,
    ]);

    respond_json(200, [
        'success' => true,
        'data' => [
            'user' => [
                'id' => $ownerId,
                'username' => $ownerCode,
                'role' => 'owner',
            ],
            'token' => $token,
        ],
    ]);
}

if ($ownerPasswordMatch && $ownerHasExpired) {
    respond_json(403, [
        'success' => false,
        'error' => tr($lang, '公司已到期或未设置到期日，无法登录', 'Company subscription is expired or not set; sign-in is blocked'),
        'error_code' => 'LOGIN_COMPANY_EXPIRED',
    ]);
}

respond_json(401, [
    'success' => false,
    'error' => tr($lang, '用户名或密码错误', 'Invalid username or password'),
    'error_code' => 'LOGIN_INVALID_CREDENTIALS',
]);
