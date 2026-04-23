<?php
session_start();
require_once 'config.php';

// 检查用户是否已登录（必须是通过主密码验证的owner）
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'owner') {
    // 如果不是owner或未登录，跳转到登录页
    header("Location: index.php");
    exit();
}

// 如果已经通过二级密码验证，直接跳转到dashboard
if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header("Location: dashboard.php");
    exit();
}

$error_message = '';

$api_token = trim((string) ($_GET['api_token'] ?? $_POST['api_token'] ?? ''));

// 处理表单提交
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $secondary_password = trim($_POST['secondary_password'] ?? '');
    
    if (empty($secondary_password)) {
        $error_message = 'Please enter secondary password';
    } elseif (!preg_match('/^\d{6}$/', $secondary_password)) {
        $error_message = 'Secondary password must be exactly 6 digits';
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
                    $posted_token = trim((string) ($_POST['api_token'] ?? ''));
                    if ($posted_token !== '' && strlen($posted_token) === 64 && ctype_xdigit($posted_token)) {
                        require_once __DIR__ . '/includes/api_auth_token.php';
                        api_auth_merge_token_session($pdo, $posted_token, [
                            'secondary_password_verified' => true,
                        ]);
                    }
                    header("Location: dashboard.php");
                    exit();
                } else {
                    $error_message = 'Secondary password is incorrect';
                }
            } else {
                // owner没有设置二级密码（不应该发生，但如果发生，允许通过）
                $_SESSION['secondary_password_verified'] = true;
                $posted_token = trim((string) ($_POST['api_token'] ?? ''));
                if ($posted_token !== '' && strlen($posted_token) === 64 && ctype_xdigit($posted_token)) {
                    require_once __DIR__ . '/includes/api_auth_token.php';
                    api_auth_merge_token_session($pdo, $posted_token, [
                        'secondary_password_verified' => true,
                    ]);
                }
                header("Location: dashboard.php");
                exit();
            }
        } catch (PDOException $e) {
            error_log("Secondary password verification error: " . $e->getMessage());
            $error_message = 'An error occurred. Please try again.';
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secondary Password Verification - EazyCount</title>
    <link rel="stylesheet" href="css/style.css?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
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
                alert('Please enter exactly 6 digits');
                secondaryPasswordInput.focus();
                return false;
            }
        });
    </script>
</body>
</html>

