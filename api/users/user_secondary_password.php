<?php
/**
 * 二级密码验证页（仅 C168 公司 user 类型）
 * 路径: api/users/user_secondary_password.php
 */
session_start();
// 注意：此文件需要写入 session（设置 secondary_password_verified）
// session_write_close() 将在每个 session 写入点之后单独调用
require_once __DIR__ . '/../../config.php';

$api_token = trim((string) ($_GET['api_token'] ?? $_POST['api_token'] ?? ''));

// 根路径（用于重定向，适配子目录部署）
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME'], 2), '/');

// 检查用户是否已登录（必须是user类型，且属于c168公司）
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'user') {
    header("Location: {$basePath}/index.php");
    exit();
}

// 检查是否属于 C168 公司
$company_id = $_SESSION['company_id'] ?? null;
$is_c168 = false;
if ($company_id) {
    try {
        $row = dbGetCompanyC168($pdo, $company_id);
        if ($row) {
            $is_c168 = true;
        }
    } catch (PDOException $e) {
        error_log("Company check error: " . $e->getMessage());
    }
}

function dbGetCompanyC168($pdo, $company_id) {
    $stmt = $pdo->prepare("SELECT id, company_id FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
    $stmt->execute([$company_id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

// 如果不是c168公司的用户，直接跳转到dashboard
if (!$is_c168) {
    $_SESSION['secondary_password_verified'] = true;
    session_write_close(); // 写入完成即释放 session 锁
    header("Location: {$basePath}/dashboard.php");
    exit();
}

if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header("Location: {$basePath}/dashboard.php");
    exit();
}

$error_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $secondary_password = trim($_POST['secondary_password'] ?? '');
    if (empty($secondary_password)) {
        $error_message = 'Please enter secondary password';
    } elseif (!preg_match('/^\d{6}$/', $secondary_password)) {
        $error_message = 'Secondary password must be exactly 6 digits';
    } else {
        try {
            $user_id = $_SESSION['user_id'];
            $user = dbGetUserSecondaryPassword($pdo, $user_id);
            if ($user && !empty($user['secondary_password'])) {
                if (password_verify($secondary_password, $user['secondary_password'])) {
                    $_SESSION['secondary_password_verified'] = true;
                    $posted_token = trim((string) ($_POST['api_token'] ?? ''));
                    if ($posted_token !== '' && strlen($posted_token) === 64 && ctype_xdigit($posted_token)) {
                        require_once __DIR__ . '/../../includes/api_auth_token.php';
                        api_auth_merge_token_session($pdo, $posted_token, [
                            'secondary_password_verified' => true,
                        ]);
                    }
                    session_write_close(); // 写入完成即释放 session 锁
                    header("Location: {$basePath}/dashboard.php");
                    exit();
                }
                $error_message = 'Secondary password is incorrect';
            } else {
                $_SESSION['secondary_password_verified'] = true;
                $posted_token = trim((string) ($_POST['api_token'] ?? ''));
                if ($posted_token !== '' && strlen($posted_token) === 64 && ctype_xdigit($posted_token)) {
                    require_once __DIR__ . '/../../includes/api_auth_token.php';
                    api_auth_merge_token_session($pdo, $posted_token, [
                        'secondary_password_verified' => true,
                    ]);
                }
                session_write_close(); // 写入完成即释放 session 锁
                header("Location: {$basePath}/dashboard.php");
                exit();
            }
        } catch (PDOException $e) {
            error_log("Secondary password verification error: " . $e->getMessage());
            $error_message = 'An error occurred. Please try again.';
        }
    }
}

function dbGetUserSecondaryPassword($pdo, $user_id) {
    $stmt = $pdo->prepare("SELECT secondary_password FROM user WHERE id = ?");
    $stmt->execute([$user_id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secondary Password Verification - EazyCount</title>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($basePath); ?>/css/style.css?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg">
    <div class="login-container">
        <div class="login-card">
            <div class="form-content">
                <h2 style="text-align: center; margin-bottom: 30px; color: #1e293b; font-size: 24px; font-weight: 600;">Secondary Password Verification</h2>
                <p style="text-align: center; margin-bottom: 30px; color: #64748b; font-size: 14px;">Please enter your 6-digit secondary password to continue</p>
                
                <form class="login-form" id="secondaryPasswordForm" method="POST">
                    <?php if ($api_token !== '' && strlen($api_token) === 64 && ctype_xdigit($api_token)): ?>
                        <input type="hidden" name="api_token" value="<?php echo htmlspecialchars($api_token, ENT_QUOTES, 'UTF-8'); ?>" />
                    <?php endif; ?>
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" 
                               placeholder="Enter 6-digit password" 
                               id="secondary_password" 
                               name="secondary_password" 
                               maxlength="6" 
                               pattern="[0-9]{6}"
                               autocomplete="off"
                               required 
                               autofocus />
                    </div>
                    
                    <?php if (!empty($error_message)): ?>
                        <div style="background-color: #fee2e2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px;">
                            <?php echo htmlspecialchars($error_message); ?>
                        </div>
                    <?php endif; ?>
                    
                    <button type="submit" class="login-btn">
                        <span>Verify</span>
                    </button>
                </form>
            </div>
        </div>
    </div>

    <script>
        const secondaryPasswordInput = document.getElementById('secondary_password');
        secondaryPasswordInput.addEventListener('input', function() {
            this.value = this.value.replace(/[^0-9]/g, '');
            if (this.value.length > 6) this.value = this.value.slice(0, 6);
        });
        secondaryPasswordInput.addEventListener('paste', function(e) {
            e.preventDefault();
            this.value = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 6);
        });
        document.getElementById('secondaryPasswordForm').addEventListener('submit', function(e) {
            if (!/^\d{6}$/.test(secondaryPasswordInput.value.trim())) {
                e.preventDefault();
                alert('Please enter exactly 6 digits');
                secondaryPasswordInput.focus();
                return false;
            }
        });
    </script>
</body>
</html>