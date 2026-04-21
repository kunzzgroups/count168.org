<?php
/**
 * 二级密码验证页（仅 C168 公司 user 类型）
 * 路径: api/users/user_secondary_password.php
 */
session_start();
// 注意：此文件需要写入 session（设置 secondary_password_verified）
// session_write_close() 将在每个 session 写入点之后单独调用
require_once __DIR__ . '/../../config.php';

// 根路径（用于重定向，适配子目录部署）
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME'], 2), '/');

$lang = isset($_GET['lang']) ? strtolower(trim((string) $_GET['lang'])) : ($_SESSION['ui_lang'] ?? 'en');
if (!in_array($lang, ['en', 'zh'], true)) {
    $lang = 'en';
}
$_SESSION['ui_lang'] = $lang;

$i18n = [
    'en' => [
        'pageTitle' => 'Secondary Password Verification',
        'pageHint' => 'Please enter your 6-digit secondary password to continue',
        'inputPlaceholder' => 'Enter 6-digit password',
        'verifyBtn' => 'Verify',
        'noticeEnterSecondary' => 'Please enter secondary password',
        'noticeSecondaryDigits' => 'Secondary password must be exactly 6 digits',
        'noticeSecondaryWrong' => 'Secondary password is incorrect',
        'noticeGenericError' => 'An error occurred. Please try again.',
        'noticeDigitsOnly' => 'Please enter exactly 6 digits',
    ],
    'zh' => [
        'pageTitle' => '二级密码验证',
        'pageHint' => '请输入 6 位二级密码以继续',
        'inputPlaceholder' => '请输入 6 位密码',
        'verifyBtn' => '验证',
        'noticeEnterSecondary' => '请输入二级密码',
        'noticeSecondaryDigits' => '二级密码必须为 6 位数字',
        'noticeSecondaryWrong' => '二级密码错误',
        'noticeGenericError' => '发生错误，请稍后重试。',
        'noticeDigitsOnly' => '请输入 6 位数字',
    ],
];

// 检查用户是否已登录（必须是user类型，且属于c168公司）
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'user') {
    header("Location: {$basePath}/index.php?lang=" . urlencode($lang));
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
    header("Location: {$basePath}/dashboard.php?lang=" . urlencode($lang));
    exit();
}

if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header("Location: {$basePath}/dashboard.php?lang=" . urlencode($lang));
    exit();
}

$error_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $secondary_password = trim($_POST['secondary_password'] ?? '');
    if (empty($secondary_password)) {
        $error_message = $i18n[$lang]['noticeEnterSecondary'];
    } elseif (!preg_match('/^\d{6}$/', $secondary_password)) {
        $error_message = $i18n[$lang]['noticeSecondaryDigits'];
    } else {
        try {
            $user_id = $_SESSION['user_id'];
            $user = dbGetUserSecondaryPassword($pdo, $user_id);
            if ($user && !empty($user['secondary_password'])) {
                if (password_verify($secondary_password, $user['secondary_password'])) {
                    $_SESSION['secondary_password_verified'] = true;
                    session_write_close(); // 写入完成即释放 session 锁
                    header("Location: {$basePath}/dashboard.php?lang=" . urlencode($lang));
                    exit();
                }
                $error_message = $i18n[$lang]['noticeSecondaryWrong'];
            } else {
                $_SESSION['secondary_password_verified'] = true;
                session_write_close(); // 写入完成即释放 session 锁
                header("Location: {$basePath}/dashboard.php?lang=" . urlencode($lang));
                exit();
            }
        } catch (PDOException $e) {
            error_log("Secondary password verification error: " . $e->getMessage());
            $error_message = $i18n[$lang]['noticeGenericError'];
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
<html lang="<?php echo htmlspecialchars($lang, ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($i18n[$lang]['pageTitle'], ENT_QUOTES, 'UTF-8'); ?> - EazyCount</title>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($basePath); ?>/css/style.css?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body class="bg">
    <div class="login-container">
        <div class="login-card">
            <div class="form-content">
                <h2 style="text-align: center; margin-bottom: 30px; color: #1e293b; font-size: 24px; font-weight: 600;"><?php echo htmlspecialchars($i18n[$lang]['pageTitle'], ENT_QUOTES, 'UTF-8'); ?></h2>
                <p style="text-align: center; margin-bottom: 30px; color: #64748b; font-size: 14px;"><?php echo htmlspecialchars($i18n[$lang]['pageHint'], ENT_QUOTES, 'UTF-8'); ?></p>
                
                <form class="login-form" id="secondaryPasswordForm" method="POST">
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" 
                               placeholder="<?php echo htmlspecialchars($i18n[$lang]['inputPlaceholder'], ENT_QUOTES, 'UTF-8'); ?>" 
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
                        <span><?php echo htmlspecialchars($i18n[$lang]['verifyBtn'], ENT_QUOTES, 'UTF-8'); ?></span>
                    </button>
                    <div class="language-switch-container">
                        <div class="lang-switch" title="Switch Language">
                            <a href="<?php echo htmlspecialchars($basePath . '/api/users/user_secondary_password.php?lang=zh', ENT_QUOTES, 'UTF-8'); ?>" class="lang-option <?php echo $lang === 'zh' ? 'active' : ''; ?>">中文</a>
                            <a href="<?php echo htmlspecialchars($basePath . '/api/users/user_secondary_password.php?lang=en', ENT_QUOTES, 'UTF-8'); ?>" class="lang-option <?php echo $lang === 'en' ? 'active' : ''; ?>">English</a>
                        </div>
                    </div>
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
                alert(<?php echo json_encode($i18n[$lang]['noticeDigitsOnly']); ?>);
                secondaryPasswordInput.focus();
                return false;
            }
        });
    </script>
</body>
</html>