<!DOCTYPE html>
<html lang="en">

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
                    <h2>Reset Password</h2>
        </div>
        <div class="login-card">
            <div class="form-content">
                
                <form class="login-form" id="resetForm" method="POST">
                    <div class="input-group">
                        <i class="fas fa-building input-icon"></i>
                        <input type="text" placeholder="Company / Group ID (or Owner Code)" id="company-id" name="company_id" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-envelope input-icon"></i>
                        <input type="email" placeholder="Enter your email address" id="email" name="email" required />
                    </div>
                    
                    <div class="tac-container">
                        <div class="input-group">
                            <i class="fas fa-key input-icon"></i>
                            <input type="text" placeholder="TAC" id="tac-field" name="tac" />
                        </div>
                        <button type="button" id="get-tac-btn" class="tac-btn">SEND</button>
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" placeholder="New Password" id="new-password" name="new_password" required />
                    </div>
                    
                    <div class="input-group">
                        <i class="fas fa-lock input-icon"></i>
                        <input type="password" placeholder="Confirm New Password" id="confirm-password" name="confirm_password" required />
                    </div>

                    <button type="submit" class="login-btn">
                        <span>Reset Password</span>
                    </button>
                    
                    <div class="language-switch-container">
                        <a href="/cn/reset-password.php" class="lang-switch" title="Switch Language">
                            <span class="lang-option">中文</span>
                            <span class="lang-option active">English</span>
                        </a>
                    </div>
                    
                    <div class="back-to-login">
                        <a href="index.php" class="back-link">
                            <i class="fas fa-arrow-left"></i>
                            Back to Login
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
            <h3 id="modalTitle" class="modal-title">Notice</h3>
            <p id="modalMessage" class="modal-message"></p>
            <div class="modal-actions">
                <button type="button" id="modalConfirmBtn" class="modal-btn modal-btn-primary">Confirm</button>
            </div>
        </div>
    </div>

    <script src="js/reset-password.js?v=<?php echo time(); ?>"></script>
</body>

</html>