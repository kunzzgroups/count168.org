<?php
session_start();
require_once 'config.php';

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

// 检查用户是否已登录（必须是通过主密码验证的owner）
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'owner') {
    // 如果不是owner或未登录，跳转到登录页
    header("Location: index.php?lang=" . urlencode($lang));
    exit();
}

// 如果已经通过二级密码验证，直接跳转到dashboard
if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header("Location: dashboard.php?lang=" . urlencode($lang));
    exit();
}

$error_message = '';

// 处理表单提交
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $secondary_password = trim($_POST['secondary_password'] ?? '');
    
    if (empty($secondary_password)) {
        $error_message = $i18n[$lang]['noticeEnterSecondary'];
    } elseif (!preg_match('/^\d{6}$/', $secondary_password)) {
        $error_message = $i18n[$lang]['noticeSecondaryDigits'];
    } else {
        // 验证二级密码
        try {
            $owner_id = $_SESSION['user_id'];
            $stmt = $pdo->prepare("SELECT secondary_password FROM owner WHERE id = ?");
            $stmt->execute([$owner_id]);
            $owner = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($owner && !empty($owner['secondary_password'])) {
                // 验证哈希密码
                if (password_verify($secondary_password, $owner['secondary_password'])) {
                    // 二级密码验证成功
                    $_SESSION['secondary_password_verified'] = true;
                    header("Location: dashboard.php?lang=" . urlencode($lang));
                    exit();
                } else {
                    $error_message = $i18n[$lang]['noticeSecondaryWrong'];
                }
            } else {
                // owner没有设置二级密码（不应该发生，但如果发生，允许通过）
                $_SESSION['secondary_password_verified'] = true;
                header("Location: dashboard.php?lang=" . urlencode($lang));
                exit();
            }
        } catch (PDOException $e) {
            error_log("Secondary password verification error: " . $e->getMessage());
            $error_message = $i18n[$lang]['noticeGenericError'];
        }
    }
}
?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($lang, ENT_QUOTES, 'UTF-8'); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($i18n[$lang]['pageTitle'], ENT_QUOTES, 'UTF-8'); ?> - EazyCount</title>
    <link rel="stylesheet" href="css/style.css?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
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
                            <a href="owner_secondary_password.php?lang=zh" class="lang-option <?php echo $lang === 'zh' ? 'active' : ''; ?>">中文</a>
                            <a href="owner_secondary_password.php?lang=en" class="lang-option <?php echo $lang === 'en' ? 'active' : ''; ?>">English</a>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
        // 限制输入只能为数字
        const secondaryPasswordInput = document.getElementById('secondary_password');
        
        secondaryPasswordInput.addEventListener('input', function() {
            // 只保留数字
            this.value = this.value.replace(/[^0-9]/g, '');
            // 限制为6位
            if (this.value.length > 6) {
                this.value = this.value.slice(0, 6);
            }
        });
        
        secondaryPasswordInput.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const numericOnly = pastedText.replace(/[^0-9]/g, '').slice(0, 6);
            this.value = numericOnly;
        });
        
        // 表单提交验证
        document.getElementById('secondaryPasswordForm').addEventListener('submit', function(e) {
            const password = secondaryPasswordInput.value.trim();
            if (!/^\d{6}$/.test(password)) {
                e.preventDefault();
                alert(<?php echo json_encode($i18n[$lang]['noticeDigitsOnly']); ?>);
                secondaryPasswordInput.focus();
                return false;
            }
        });
    </script>
</body>
</html>

