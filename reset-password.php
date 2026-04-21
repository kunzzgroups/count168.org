<?php
$sessionStartedHere = false;
if (session_status() === PHP_SESSION_NONE) {
    session_start();
    $sessionStartedHere = true;
}
$lang = isset($_GET['lang']) ? strtolower(trim((string) $_GET['lang'])) : 'en';
if (!in_array($lang, ['en', 'zh'], true)) {
    $lang = 'en';
}
$_SESSION['ui_lang'] = $lang;
if ($sessionStartedHere) {
    session_write_close();
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($lang, ENT_QUOTES, 'UTF-8'); ?>">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password - EazyCount</title>
    <link rel="stylesheet" href="css/style.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/reset-password.css?v=<?php echo time(); ?>">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>

<body class="bg">
    <div class="login-container">
        <div class="login-header">
                    <h2 data-i18n="pageTitle">Reset Password</h2>
        </div>
        <div class="login-card">
            <div class="form-content">
                
                <form class="login-form" id="resetForm" method="POST">
                    <div class="input-group">
                        <i class="fas fa-building input-icon"></i>
                        <input type="text" placeholder="Company / Group ID (or Owner Code)" id="company-id" name="company_id" data-i18n-placeholder="companyPlaceholder" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-envelope input-icon"></i>
                        <input type="email" placeholder="Enter your email address" id="email" name="email" data-i18n-placeholder="emailPlaceholder" required />
                    </div>
                    
                    <div class="tac-container">
                        <div class="input-group">
                            <i class="fas fa-key input-icon"></i>
                            <input type="text" placeholder="TAC" id="tac-field" name="tac" data-i18n-placeholder="tacPlaceholder" />
                        </div>
                        <button type="button" id="get-tac-btn" class="tac-btn" data-i18n="sendBtn">SEND</button>
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" placeholder="New Password" id="new-password" name="new_password" data-i18n-placeholder="newPasswordPlaceholder" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" placeholder="Confirm New Password" id="confirm-password" name="confirm_password" data-i18n-placeholder="confirmPasswordPlaceholder" required />
                    </div>

                    <button type="submit" class="login-btn">
                        <span data-i18n="resetBtn">Reset Password</span>
                    </button>
                    
                    <div class="language-switch-container">
                        <?php
                        $zhUrl = 'reset-password.php?lang=zh';
                        $enUrl = 'reset-password.php?lang=en';
                        ?>
                        <div class="lang-switch" title="Switch Language">
                            <a href="<?php echo htmlspecialchars($zhUrl, ENT_QUOTES, 'UTF-8'); ?>" class="lang-option <?php echo $lang === 'zh' ? 'active' : ''; ?>">中文</a>
                            <a href="<?php echo htmlspecialchars($enUrl, ENT_QUOTES, 'UTF-8'); ?>" class="lang-option <?php echo $lang === 'en' ? 'active' : ''; ?>">English</a>
                        </div>
                    </div>
                    
                    <div class="back-to-login">
                        <a href="index.php?lang=<?php echo htmlspecialchars($lang, ENT_QUOTES, 'UTF-8'); ?>" class="back-link">
                            <i class="fas fa-arrow-left"></i>
                            <span data-i18n="backToLogin">Back to Login</span>
                        </a>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- 自定义弹窗（替代浏览器 alert，风格与确认删除弹窗一致） -->
    <div id="alertModalOverlay" class="modal-overlay" aria-hidden="true">
        <div class="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
            <div class="modal-icon-wrap">
                <i class="fas fa-exclamation-triangle modal-icon" aria-hidden="true"></i>
            </div>
            <h3 id="modalTitle" class="modal-title" data-i18n="noticeTitle">Notice</h3>
            <p id="modalMessage" class="modal-message"></p>
            <div class="modal-actions">
                <button type="button" id="modalConfirmBtn" class="modal-btn modal-btn-primary" data-i18n="confirmBtn">Confirm</button>
            </div>
        </div>
    </div>

    <script>
        window.__RESET_LANG__ = "<?php echo htmlspecialchars($lang, ENT_QUOTES, 'UTF-8'); ?>";
    </script>
    <script src="js/reset-password.js?v=<?php echo time(); ?>"></script>
</body>

</html>