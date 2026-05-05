<?php
// 确保 session 已启动
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// 检查用户是否已登录
if (!isset($_SESSION['user_id'])) {
    // 如果未登录，输出 JavaScript 重定向到登录页
    // 这样可以确保整个页面都停止工作，而不仅仅是 sidebar 消失
    echo '<script>window.location.href = "index.php";</script>';
    exit();
}

$isMember = isset($_SESSION['user_type']) && strtolower($_SESSION['user_type']) === 'member';

// 获取用户信息
$user_id = $_SESSION['user_id'];
$login_id = $_SESSION['login_id'] ?? '';
$name = $_SESSION['name'] ?? '';
$role = $_SESSION['role'] ?? '';

require_once 'config.php';
require_once __DIR__ . '/includes/c168_domain_access.php';
$permissions = [];

// 获取用户权限（仅针对 member 用户）
if (!$isMember) {
    $stmt = $pdo->prepare("SELECT permissions FROM user WHERE id = ?");
    $stmt->execute([$user_id]);
    $userPermissions = $stmt->fetchColumn();
    $permissions = $userPermissions ? json_decode($userPermissions, true) : [];
}

$companyId = $_SESSION['company_id'] ?? null;  // company 的数字主键

// 当前选中公司是否为 C168（用于侧边栏菜单显示控制，不受角色限制）
$isCurrentCompanyC168 = false;
$currentCompanyCode = strtoupper(trim((string) ($_SESSION['company_code'] ?? '')));
if ($currentCompanyCode === 'C168') {
    $isCurrentCompanyC168 = true;
} elseif ($companyId) {
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
        $stmt->execute([$companyId]);
        $isCurrentCompanyC168 = $stmt->fetchColumn() > 0;
    } catch (PDOException $e) {
        error_log("检查当前公司是否 c168 失败: " . $e->getMessage());
        $isCurrentCompanyC168 = false;
    }
}

// C168：Domain / Announcement 等，当前公司为 C168 且角色在 userlist 白名单（含 owner）
$hasC168DomainPageAccess = $isCurrentCompanyC168 && userHasC168DomainPageAccess(strtolower((string) ($role ?? '')));

$avatarLetter = $login_id ? strtoupper($login_id[0]) : 'U';

// 头像 ID 与路径映射（与前端 avatarImages 一致，用于服务端输出初始 src 避免切换页面混乱）
$avatarImages = [
    'male1' => 'images/avatar1.png',
    'male2' => 'images/avatar2.png',
    'male3' => 'images/avatar3.png',
    'male4' => 'images/avatar4.png',
    'male5' => 'images/avatar5.png',
    'male6' => 'images/avatar6.png',
    'male7' => 'images/avatar7.png',
    'male8' => 'images/avatar8.png',
    'male9' => 'images/avatar9.png',
    'female1' => 'images/female1.png',
    'female2' => 'images/female2.png',
    'female3' => 'images/female3.png',
    'female4' => 'images/female4.png',
    'female5' => 'images/female5.png',
    'female6' => 'images/female6.png',
    'female7' => 'images/female7.png',
    'female8' => 'images/female8.png',
    'female9' => 'images/female9.png'
];
$avatarId = isset($_COOKIE['selectedAvatar']) && isset($avatarImages[$_COOKIE['selectedAvatar']])
    ? $_COOKIE['selectedAvatar']
    : 'male1';
$initialAvatarSrc = $avatarImages[$avatarId];

// 获取当前公司的到期日期
$company_expiration_date = null;
$expiration_countdown_text = '';
$expiration_status = 'normal';
if ($companyId) {
    try {
        $stmt = $pdo->prepare("SELECT expiration_date FROM company WHERE id = ?");
        $stmt->execute([$companyId]);
        $company_expiration_date = $stmt->fetchColumn();

        // 在 PHP 端计算倒计时（使用 $now 避免覆盖包含页的 $today，如 member.php 的日期显示）
        if ($company_expiration_date) {
            $now = new DateTime();
            $now->setTime(0, 0, 0);
            $expiration = new DateTime($company_expiration_date);
            $expiration->setTime(0, 0, 0);

            $diff = $now->diff($expiration);
            $diffDays = (int) $diff->format('%r%a'); // 带符号的天数差

            if ($diffDays < 0) {
                $expiration_countdown_text = 'Expired';
                $expiration_status = 'expired';
            } else if ($diffDays === 0) {
                $expiration_countdown_text = 'Expires today';
                $expiration_status = 'warning';
            } else if ($diffDays <= 7) {
                $expiration_countdown_text = $diffDays . ' day' . ($diffDays > 1 ? 's' : '') . ' left';
                $expiration_status = 'warning';
            } else if ($diffDays <= 30) {
                $expiration_countdown_text = $diffDays . ' days left';
                $expiration_status = 'normal';
            } else {
                $months = floor($diffDays / 30);
                $days = $diffDays % 30;
                if ($days === 0) {
                    $expiration_countdown_text = $months . ' month' . ($months > 1 ? 's' : '') . ' left';
                } else {
                    $expiration_countdown_text = $months . 'm ' . $days . 'd left';
                }
                $expiration_status = 'normal';
            }
        } else {
            $expiration_countdown_text = 'No expiration date';
            $expiration_status = 'normal';
        }
    } catch (PDOException $e) {
        error_log("获取公司到期日期失败: " . $e->getMessage());
        $company_expiration_date = null;
        $expiration_countdown_text = 'No expiration date';
        $expiration_status = 'normal';
    }
}

// 获取当前公司的 category 权限（Games/Bank/Loan/Rate/Money），用于 Data Capture；Maintenance > Process 在 hasMaintenance 时始终输出 DOM（无 Bank 则默认隐藏），切换公司后由 has_bank + js/sidebar.js 控制；含 Games 时 Process 仅 Category=Bank（localStorage）显示；Bank 视图下 Data Capture/Transaction/Formula 由 js 隐藏
$companyHasGambling = false;
$companyCategories = [];
if ($companyId) {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmt->execute([$companyId]);
        $permsJson = $stmt->fetchColumn();
        if ($permsJson) {
            $companyPerms = json_decode($permsJson, true);
            $companyCategories = is_array($companyPerms) ? $companyPerms : [];
            $companyHasGambling = in_array('Games', $companyCategories) || in_array('Gambling', $companyCategories);
        }
    } catch (PDOException $e) {
        error_log("获取公司权限失败: " . $e->getMessage());
    }
}
$companyHasBank = !empty($companyCategories) && in_array('Bank', $companyCategories);
?>
<!--
================================================================================
  sidebar.php 为被 include 的片段，不在此处添加 <link> / <script src>。
  请在主页面（如 account-list.php、dashboard.php 等）的 <head> 中加入：
    <link rel="stylesheet" href="css/sidebar.css">
    <script src="js/sidebar.js?v=<?php echo time(); ?>" defer></script>
  如需 favicon 与头像预加载，可在主页面 <head> 中按需添加。
    <link rel="icon" type="image/png" href="/images/count_logo.png">
    <link rel="preload" href="(当前用户头像 URL)" as="image">
================================================================================
-->
<!-- Sidebar HTML (CSS 已移至 css/sidebar.css，JS 逻辑已移至 js/sidebar.js) -->
<!-- Overlay -->
<div class="informationmenu-overlay"></div>

<!-- Sidebar Menu -->
<div class="informationmenu">
    <div class="informationmenu-header">
        <div class="header-logo-section">
            <img src="images/count_whitelogo.png" alt="EAZYCOUNT Logo" class="header-logo">
            <!-- 通知铃铛 -->
            <div class="notification-bell" title="Notifications" onclick="toggleNotificationPanel(event)">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                        d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
                </svg>
            </div>
        </div>

        <!-- 用户信息容器（头像和用户信息左右排版）-->
        <div class="user-info-container">
            <!-- 添加头像选择器（改为使用 PNG 照片）-->
            <div class="avatar-selector-container">
                <div class="current-avatar" id="currentAvatar" onclick="toggleAvatarOptions()">
                    <!-- 服务端根据 cookie 输出初始 src，切换页面时首屏即显示正确头像，避免混乱 -->
                    <img id="currentAvatarImg" class="current-avatar-img"
                        src="<?php echo htmlspecialchars($initialAvatarSrc); ?>"
                        data-avatar-id="<?php echo htmlspecialchars($avatarId); ?>" alt="Avatar" fetchpriority="high"
                        loading="eager">
                </div>

                <div class="avatar-options" id="avatarOptions">
                    <div class="options-title">Choose Avatar</div>

                    <!-- 性别选择 -->
                    <div class="gender-selection" id="genderSelection">
                        <button type="button" class="gender-btn active" onclick="selectGender('male')">Male</button>
                        <button type="button" class="gender-btn" onclick="selectGender('female')">Female</button>
                    </div>

                    <!-- 男性头像列表-->
                    <div class="avatar-list show" id="maleAvatarList">
                        <div class="avatar-option" data-avatar-id="male1" onclick="selectAvatar('male1')">
                            <img src="images/avatar1.png" alt="Male Avatar 1" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male2" onclick="selectAvatar('male2')">
                            <img src="images/avatar2.png" alt="Male Avatar 2" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male3" onclick="selectAvatar('male3')">
                            <img src="images/avatar3.png" alt="Male Avatar 3" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male4" onclick="selectAvatar('male4')">
                            <img src="images/avatar4.png" alt="Male Avatar 4" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male5" onclick="selectAvatar('male5')">
                            <img src="images/avatar5.png" alt="Male Avatar 5" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male6" onclick="selectAvatar('male6')">
                            <img src="images/avatar6.png" alt="Male Avatar 6" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male7" onclick="selectAvatar('male7')">
                            <img src="images/avatar7.png" alt="Male Avatar 7" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male8" onclick="selectAvatar('male8')">
                            <img src="images/avatar8.png" alt="Male Avatar 8" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="male9" onclick="selectAvatar('male9')">
                            <img src="images/avatar9.png" alt="Male Avatar 9" class="avatar-option-img">
                        </div>
                    </div>

                    <!-- 女性头像列表-->
                    <div class="avatar-list" id="femaleAvatarList">
                        <div class="avatar-option" data-avatar-id="female1" onclick="selectAvatar('female1')">
                            <img src="images/female1.png" alt="Female Avatar 1" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female2" onclick="selectAvatar('female2')">
                            <img src="images/female2.png" alt="Female Avatar 2" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female3" onclick="selectAvatar('female3')">
                            <img src="images/female3.png" alt="Female Avatar 3" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female4" onclick="selectAvatar('female4')">
                            <img src="images/female4.png" alt="Female Avatar 4" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female5" onclick="selectAvatar('female5')">
                            <img src="images/female5.png" alt="Female Avatar 5" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female6" onclick="selectAvatar('female6')">
                            <img src="images/female6.png" alt="Female Avatar 6" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female7" onclick="selectAvatar('female7')">
                            <img src="images/female7.png" alt="Female Avatar 7" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female8" onclick="selectAvatar('female8')">
                            <img src="images/female8.png" alt="Female Avatar 8" class="avatar-option-img">
                        </div>
                        <div class="avatar-option" data-avatar-id="female9" onclick="selectAvatar('female9')">
                            <img src="images/female9.png" alt="Female Avatar 9" class="avatar-option-img">
                        </div>
                    </div>
                </div>
            </div>

            <div class="user-avatar-dropdown">
                <div class="user-info">
                    <div class="user-name"><?php echo htmlspecialchars($login_id); ?></div>
                    <div class="user-role"><?php echo ucfirst($role); ?></div>
                </div>
            </div>
        </div>
        <!-- 语言切换按钮 -->
        <!-- <div class="language-switcher">
            <div class="language-dropdown">
                <button class="language-btn" onclick="toggleLanguageDropdown()">
                    <img src="images/uk.png" alt="English" class="flag-icon" id="current-flag">
                    <span class="language-text" id="current-lang">English</span>
                    <span class="dropdown-arrow">&#9658;</span>
                </button>
                <div class="language-dropdown-list" id="languageDropdown">
                    <div class="language-option" onclick="selectLanguage('en')">
                        <img src="images/uk.png" alt="English" class="flag-icon">
                        <span>English</span>
                    </div>
                    <div class="language-option" onclick="selectLanguage('zh')">
                        <img src="images/china.png" alt="涓枃" class="flag-icon">
                        <span>涓枃</span>
                    </div>
                </div>
            </div>
        </div> -->
    </div>

    <div class="informationmenu-content">
        <div class="content-separator"></div>

        <?php if ($isMember): ?>
            <!-- Member Win/Loss -->
            <div class="informationmenu-section">
                <div class="informationmenu-section-title account-direct" data-page="member.php"
                    onclick="window.location.href='member.php'">
                    <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                        <path
                            d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                    </svg>
                    Win/Loss
                </div>
            </div>
        <?php else: ?>
            <!-- Home Section -->
            <?php if (empty($permissions) || in_array('home', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title" data-page="dashboard.php"
                        onclick="window.location.href='dashboard.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                        Home
                    </div>
                </div>
            <?php endif; ?>

            <!-- Domain：C168 + userlist 角色白名单（不再要求 permissions 勾选 domain） -->
            <?php if ($hasC168DomainPageAccess): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title" data-page="domain.php"
                        onclick="window.location.href='domain.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                        </svg>
                        Domain
                    </div>
                </div>
            <?php endif; ?>

            <!-- Announcement：C168 + 与 Domain 相同的 userlist 角色白名单 -->
            <?php if ($hasC168DomainPageAccess): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title account-direct" data-page="announcement.php"
                        onclick="window.location.href='announcement.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                        </svg>
                        Announcement
                    </div>
                </div>
            <?php endif; ?>

            <!-- Auto Login Manager Section -->
            <!-- <div class="informationmenu-section">
                <div class="informationmenu-section-title account-direct" data-page="auto-login-manager.php" onclick="window.location.href='auto-login-manager.php'">
                    <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                    </svg>
                    鑷姩鐧诲綍绠＄悊
                </div>
            </div> -->

            <!-- Admin Section -->
            <?php if (empty($permissions) || in_array('admin', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title account-direct" data-page="userlist.php"
                        onclick="window.location.href='userlist.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                        </svg>
                        Admin
                    </div>
                </div>
            <?php endif; ?>

            <?php
            // 侧栏 Deleted Log 入口：改为 true 即可恢复显示
            $sidebarDeletedLogMenuEnabled = false;
            $sidebarShowDeletedLog = $sidebarDeletedLogMenuEnabled && (
                strtolower((string) $role) === 'admin'
                || strtolower((string) $role) === 'owner'
                || (isset($_SESSION['user_type']) && strtolower((string) $_SESSION['user_type']) === 'owner')
            );
            ?>
            <?php if ($sidebarShowDeletedLog): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title account-direct" data-page="deleted-log.php"
                        onclick="window.location.href='deleted-log.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                        </svg>
                        Deleted Log
                    </div>
                </div>
            <?php endif; ?>

            <!-- Account Section -->
            <?php if (empty($permissions) || in_array('account', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title account-direct" data-page="account-list.php"
                        onclick="window.location.href='account-list.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                        Account
                    </div>
                </div>
            <?php endif; ?>

            <!-- Ownership：仅由 ownership 权限控制显示 -->
            <?php if (empty($permissions) || in_array('ownership', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title account-direct" data-page="ownership.php"
                        onclick="window.location.href='ownership.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                        </svg>
                        Ownership
                    </div>
                </div>
            <?php endif; ?>

            <!-- Process Section -->
            <?php if (empty($permissions) || in_array('process', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title" data-page="processlist.php"
                        onclick="window.location.href='processlist.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                        Process
                    </div>
                </div>
            <?php endif; ?>

            <!-- Data Capture Section：用户有 datacapture 权限时输出，显隐由当前公司 Games 权限控制（含切换公司时即时更新）；C168 同样显示顶层入口 -->
            <?php if (empty($permissions) || in_array('datacapture', $permissions)): ?>
                <div class="informationmenu-section" id="sidebar-datacapture-section" <?php echo $companyHasGambling ? '' : ' style="display:none;"'; ?>>
                    <div class="informationmenu-section-title" data-page="datacapture.php"
                        onclick="window.location.href='datacapture.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                        </svg>
                        Data Capture
                    </div>
                </div>
            <?php endif; ?>

            <!-- Transaction Payment Section -->
            <?php if (empty($permissions) || in_array('payment', $permissions)): ?>
                <div class="informationmenu-section">
                    <div class="informationmenu-section-title" data-page="transaction.php"
                        onclick="window.location.href='transaction.php'">
                        <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                            <path
                                d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                        </svg>
                        Transaction Payment
                    </div>
                </div>
            <?php endif; ?>

            <!-- Report Section（仅当前公司有 Games 权限时显示） -->
            <?php if (empty($permissions) || in_array('report', $permissions)): ?>
                <div class="informationmenu-section" id="sidebar-report-section" <?php echo $companyHasGambling ? '' : ' style="display:none;"'; ?>>
                    <div class="menu-item-wrapper">
                        <div class="informationmenu-section-title" data-section="report">
                            <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                            </svg>
                            Report
                            <span class="section-arrow">▶</span>
                        </div>
                        <div class="submenu" id="report-submenu">
                            <div class="submenu-content">
                                <a href="customer_report.php" class="submenu-item">
                                    <span>Customer Report</span>
                                </a>
                                <a href="domain_report.php" class="submenu-item">
                                    <span>Domain Report</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            <?php endif; ?>

            <!-- Maintenance Section：主项始终显示；子项按用户是否勾选 maintenance + 公司 category 控制 -->
            <?php
            $hasMaintenance = (empty($permissions) || in_array('maintenance', $permissions));
            $isSupervisorRole = (strtolower((string)$role) === 'supervisor');
            // Supervisor 在 Games 公司下，即使未勾选 maintenance，也保留 Maintenance（仅显示 Games 相关项）
            $showMaintenanceSection = $hasMaintenance || ($isSupervisorRole && $companyHasGambling);
            ?>
            <?php if ($showMaintenanceSection): ?>
                <div class="informationmenu-section">
                    <div class="menu-item-wrapper">
                        <div class="informationmenu-section-title" data-section="maintenance">
                            <svg class="section-icon" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                            </svg>
                            Maintenance
                            <span class="section-arrow">▶</span>
                        </div>
                        <div class="submenu" id="maintenance-submenu">
                            <div class="submenu-content">
                                <?php if ($companyHasGambling && $hasMaintenance): ?>
                                    <a href="capture_maintenance.php" class="submenu-item" id="maintenance-capture-link">
                                        <span>Data Capture</span>
                                    </a>
                                <?php endif; ?>
                                <?php if ($companyHasGambling): ?>
                                    <a href="transaction_maintenance.php" class="submenu-item" id="maintenance-transaction-link">
                                        <span>Transaction</span>
                                    </a>
                                <?php endif; ?>
                                <?php if ($hasMaintenance): ?>
                                    <a href="payment_maintenance.php" class="submenu-item">
                                        <span>Payment</span>
                                    </a>
                                <?php endif; ?>
                                <?php if ($companyHasGambling): ?>
                                    <a href="formula_maintenance.php" class="submenu-item" id="maintenance-formula-link">
                                        <span>Formula</span>
                                    </a>
                                <?php endif; ?>
                                <?php if ($hasMaintenance): ?>
                                    <a href="bankprocess_maintenance.php" class="submenu-item" id="maintenance-process-link"<?php echo $companyHasBank ? '' : ' style="display:none;"'; ?>>
                                        <span>Process</span>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        <?php endif; ?>
    </div>

    <div class="informationmenu-footer">
        <?php if ($company_expiration_date): ?>
            <div class="company-expiration-countdown <?php echo $expiration_status; ?>" id="companyExpirationCountdown">
                <svg class="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div class="expiration-content">
                    <span class="expiration-label">Exp:</span>
                    <span class="expiration-countdown-text <?php echo $expiration_status; ?>" id="expirationCountdownText">
                        <?php echo htmlspecialchars($expiration_countdown_text); ?>
                    </span>
                </div>
            </div>
        <?php endif; ?>
        <button class="btn logout-btn" onclick="handleLogout()">
            Logout
        </button>
    </div>
</div>

<!-- 通知面板遮罩 -->
<div class="notification-overlay" id="notificationOverlay" onclick="closeNotificationPanel()"></div>

<!-- 通知面板遮罩 -->
<div class="notification-panel" id="notificationPanel">
    <div class="notification-header">
        <h2>Announcements</h2>
        <button class="notification-close" onclick="closeNotificationPanel()" title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    </div>
    <div class="notification-content" id="notificationContent">
        <!-- 公告将在这里动态加载 -->
    </div>
</div>

<!-- Sidebar JavaScript: PHP 变量注入，调用外部 js/sidebar.js 中的 updateExpirationCountdown / updateSidebarDataCaptureVisibility -->
<script>
    window.SIDEBAR_IS_MEMBER = <?php echo $isMember ? 'true' : 'false'; ?>;
    window.SIDEBAR_EXPIRATION_DATE = '<?php echo $company_expiration_date ? addslashes($company_expiration_date) : ''; ?>';
    window.SIDEBAR_COMPANY_HAS_GAMBLING = <?php echo $companyHasGambling ? 'true' : 'false'; ?>;
    window.SIDEBAR_COMPANY_HAS_BANK = <?php echo $companyHasBank ? 'true' : 'false'; ?>;
    window.SIDEBAR_COMPANY_CODE = <?php echo json_encode($currentCompanyCode); ?>;
    window.SIDEBAR_USER_ROLE = <?php echo json_encode(strtolower((string) $role)); ?>;
    (function () {
        if (typeof updateExpirationCountdown === 'function') {
            if (window.SIDEBAR_EXPIRATION_DATE) {
                updateExpirationCountdown();
                setInterval(updateExpirationCountdown, 60000);
            }
        }
        if (typeof updateSidebarDataCaptureVisibility === 'function' && window.SIDEBAR_COMPANY_HAS_GAMBLING !== undefined) {
            updateSidebarDataCaptureVisibility(window.SIDEBAR_COMPANY_HAS_GAMBLING, window.SIDEBAR_COMPANY_HAS_BANK);
        }
    })();
</script>
<script>
    <?php
    $sidebarRole = isset($_SESSION['role']) ? strtolower((string) $_SESSION['role']) : '';
    $sidebarRo = isset($_SESSION['read_only']) ? (int) $_SESSION['read_only'] : null;
    $sidebarRoLocked = ($sidebarRo === null || $sidebarRo === 1);
    $isExtSession = isset($_SESSION['is_external_view']) && $_SESSION['is_external_view'];
    $isPartnershipRo = ($sidebarRole === 'partnership' && $sidebarRoLocked);
    $isAuditRo = ($sidebarRole === 'audit' && $sidebarRoLocked);
    $isGlobalReadOnlyUi = $isExtSession || $isPartnershipRo || $isAuditRo;
    // Partnership / 外部视图：沿用旧逻辑隐藏部分侧栏；Audit 只读不隐藏侧栏（按权限进入各页），仅全站控件只读
    $applySidebarHide = $isExtSession || $isPartnershipRo;
    ?>
    // Partnership read_only、Audit read_only、外部视图：全站只读（与旧脚本兼容）
    window.isExternalView = <?php echo $isGlobalReadOnlyUi ? 'true' : 'false'; ?>;

    if (window.isExternalView) {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.add('session-readonly-ui');
            console.log('Read-only session: view-only UI');

            <?php if ($applySidebarHide): ?>
            (function applySidebarHideForPartner() {
                const hideCategories = ['Admin', 'Account', 'Process', 'Data Capture', 'Transaction Payment', 'Maintenance'];
                document.querySelectorAll('.informationmenu .informationmenu-section').forEach((section) => {
                    const titleEl = section.querySelector('.informationmenu-section-title');
                    if (!titleEl) return;
                    const normalized = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
                    for (let i = 0; i < hideCategories.length; i++) {
                        if (normalized.indexOf(hideCategories[i]) !== -1) {
                            section.style.display = 'none';
                            return;
                        }
                    }
                });
            })();
            <?php endif; ?>

            (function applyGlobalReadOnlyLocks() {
                function isExempt(el) {
                    if (!el || el.nodeType !== 1) return true;
                    if (el.getAttribute && el.getAttribute('data-readonly-exempt') === '1') return true;
                    if (el.closest && el.closest('.informationmenu')) return true;
                    if (el.closest && el.closest('.informationmenu-footer')) return true;
                    if (el.closest && (el.closest('#notificationPanel') || el.closest('.notification-panel') || el.closest('#notificationOverlay'))) return true;
                    if (el.classList && el.classList.contains('logout-btn')) return true;
                    if (el.closest && el.closest('.logout-btn')) return true;
                    if (el.closest && el.closest('.fc-button')) return true;
                    // Capture Date 日历浮层挂在 section 外（#calendar-popup），须单独豁免才能选日期查资料
                    if (el.closest && el.closest('#calendar-popup')) return true;
                    if (el.closest && el.closest('.calendar-popup')) return true;
                    if (el.closest && el.closest('.flatpickr-calendar')) return true;
                    // 筛选/查询区：允许改条件浏览（非落库「资料」）
                    if (el.closest && el.closest('.transaction-search-section')) return true;
                    if (el.closest && el.closest('.transaction-bottom-filters')) return true;
                    if (el.closest && el.closest('[class*="company-filter"]')) return true;
                    if (el.closest && el.closest('.shared-company-wrapper')) return true;
                    if (el.closest && el.closest('.shared-group-wrapper')) return true;
                    if (el.closest && el.closest('[data-readonly-filter-area="1"]')) return true;
                    // 仅查看收件箱：保留打开/刷新；禁止 Approve/Reject
                    if (el.closest && el.closest('#contraInboxWrap')) {
                        if (el.classList && (el.classList.contains('contra-inbox-approve') || el.classList.contains('contra-inbox-reject'))) {
                            return false;
                        }
                        return true;
                    }
                    if (el.id === 'modal_close' || (el.classList && el.classList.contains('transaction-modal-close'))) return true;
                    return false;
                }

                function lockOne(el) {
                    if (isExempt(el)) return;
                    const tag = (el.tagName || '').toLowerCase();
                    const type = (el.type || '').toLowerCase();
                    if (type === 'hidden') return;
                    if (tag === 'a') return;
                    if (el.dataset && el.dataset.readonlyLocked === '1') return;

                    if (tag === 'button' || type === 'submit' || type === 'button') {
                        el.disabled = true;
                        el.style.pointerEvents = 'none';
                        el.style.opacity = '0.5';
                        el.title = el.title || 'Read-only mode';
                        el.dataset.readonlyLocked = '1';
                        return;
                    }
                    if (tag === 'select') {
                        el.disabled = true;
                        el.dataset.readonlyLocked = '1';
                        return;
                    }
                    if (tag === 'textarea') {
                        el.readOnly = true;
                        el.dataset.readonlyLocked = '1';
                        return;
                    }
                    if (tag === 'input') {
                        if (type === 'checkbox' || type === 'radio') {
                            el.disabled = true;
                        } else {
                            el.readOnly = true;
                        }
                        el.dataset.readonlyLocked = '1';
                    }
                }

                function scan(root) {
                    root.querySelectorAll('input, select, textarea, button').forEach(lockOne);
                }

                scan(document.body);
                const mo = new MutationObserver((mutations) => {
                    mutations.forEach((m) => {
                        m.addedNodes.forEach((n) => {
                            if (n.nodeType !== 1) return;
                            if (n.matches && n.matches('input, select, textarea, button')) lockOne(n);
                            if (n.querySelectorAll) scan(n);
                        });
                    });
                });
                mo.observe(document.body, { childList: true, subtree: true });
            })();
        });
    }
</script>