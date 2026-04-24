<?php
/**
 * 二级密码验证页（仅 C168 公司 user 类型）
 * 与 index.php 同级，位于站点应用根目录。
 */
session_start();
// 注意：此文件需要写入 session（设置 secondary_password_verified）
// session_write_close() 将在每个 session 写入点之后单独调用
require_once __DIR__ . '/config.php';

/**
 * 应用根在站点内的 URL 路径：'' 表示域名根下；'/subdir' 表示子目录安装。
 * 本文件在应用根（与 index.php 同级），用 SCRIPT_NAME 上溯 1 级得到 URL 前缀。
 * 不要用 DOCUMENT_ROOT+realpath：磁盘路径常在 …/public_html/api，会得到 tail=api → 误判为 /api/css（404）。
 */
$appWebBase = '';
$sn = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
if ($sn !== '' && $sn !== '/') {
    $up = str_replace('\\', '/', dirname($sn, 1));
    if ($up !== '/' && $up !== '' && $up !== '.') {
        $appWebBase = rtrim($up, '/');
    }
}

$toAppPath = static function (string $path) use ($appWebBase): string {
    $path = ltrim(str_replace('\\', '/', $path), '/');
    if ($appWebBase === '' || $appWebBase === '/') {
        return '/' . $path;
    }
    return rtrim($appWebBase, '/') . '/' . $path;
};

// 检查用户是否已登录（必须是user类型，且属于c168公司）
if (!isset($_SESSION['user_id']) || !isset($_SESSION['user_type']) || $_SESSION['user_type'] !== 'user') {
    header('Location: ' . $toAppPath('index.php'));
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
    header('Location: ' . $toAppPath('dashboard.php'));
    exit();
}

if (isset($_SESSION['secondary_password_verified']) && $_SESSION['secondary_password_verified'] === true) {
    header('Location: ' . $toAppPath('dashboard.php'));
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
                    session_write_close(); // 写入完成即释放 session 锁
                    header('Location: ' . $toAppPath('dashboard.php'));
                    exit();
                }
                $error_message = 'Secondary password is incorrect';
            } else {
                $_SESSION['secondary_password_verified'] = true;
                session_write_close(); // 写入完成即释放 session 锁
                header('Location: ' . $toAppPath('dashboard.php'));
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
    <?php
    $styleHref = htmlspecialchars($toAppPath('css/style.css'), ENT_QUOTES, 'UTF-8');
    $global13 = __DIR__ . '/css/global-13inch.css';
    $global13v = is_readable($global13) ? filemtime($global13) : time();
    $global13Href = htmlspecialchars($toAppPath('css/global-13inch.css'), ENT_QUOTES, 'UTF-8');
    ?>
    <link rel="stylesheet" href="<?php echo $styleHref; ?>?v=<?php echo time(); ?>" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo $global13Href; ?>?v=<?php echo (int) $global13v; ?>">
    <style id="secondary-pwd-layout-fallback">
        /* 若外链 style 仍失败，保证与登录页一致的居中与表单样式（背景图用根相对路径） */
        body.bg{min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:url('<?php echo htmlspecialchars($toAppPath('images/count_bg.png'), ENT_QUOTES, 'UTF-8'); ?>') center/cover no-repeat}
        .login-container{width:100%;max-width:min(420px,90vw);margin:0 auto;position:relative;z-index:2}
        .login-card{background:rgba(255,255,255,.95);border-radius:0 0 30px 30px;box-shadow:0 20px 40px rgba(0,0,0,.1);padding:0;overflow:hidden;backdrop-filter:blur(10px)}
        .form-content{padding:clamp(20px,5vw,30px) clamp(15px,4vw,20px)}
        .login-form{display:flex;flex-direction:column;gap:clamp(15px,4vw,20px)}
        .input-group{position:relative;display:flex;align-items:center}
        .input-icon{position:absolute;left:clamp(15px,4vw,20px);top:50%;transform:translateY(-50%);color:#56ccf2;font-size:clamp(14px,3vw,16px);z-index:2}
        .input-group input{width:100%;padding:clamp(10px,2.5vw,12px) clamp(20px,5vw,25px) clamp(10px,2.5vw,12px) clamp(40px,10vw,46px);border:2px solid #56ccf2;border-radius:50px;font-size:clamp(14px,3vw,16px);background:rgba(255,255,255,.9);color:#333;box-sizing:border-box}
        .input-group input:focus{outline:none;border-color:#004ff9;box-shadow:0 0 0 3px rgba(0,79,249,.1)}
        .login-btn{background:linear-gradient(135deg,#004ff9,#56ccf2);color:#fff;border:none;padding:clamp(11px,3vw,15px);border-radius:50px;font-size:clamp(16px,4vw,18px);font-weight:600;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,79,249,.3)}
    </style>
</head>
<body class="bg">
    <div class="login-container">
        <div class="login-card">
            <div class="form-content">
                <h2 style="text-align: center; margin-bottom: 30px; color: #1e293b; font-size: 24px; font-weight: 600;">Secondary Password Verification</h2>
                <p style="text-align: center; margin-bottom: 30px; color: #64748b; font-size: 14px;">Please enter your 6-digit secondary password to continue</p>
                
                <form class="login-form" id="secondaryPasswordForm" method="POST">
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