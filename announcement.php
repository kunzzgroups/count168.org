<?php
// 使用统一的session检查
require_once 'session_check.php';
require_once __DIR__ . '/includes/c168_domain_access.php';

// 不缓存 HTML，部署后刷新即可拿到带最新 ?v= 的页面
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$user_id      = $_SESSION['user_id']  ?? null;
$user_role    = strtolower($_SESSION['role'] ?? '');
$company_id   = $_SESSION['company_id'] ?? null;
$company_code = strtoupper($_SESSION['company_code'] ?? '');

// 检查是否为C168
$isC168ByCode = ($company_code === 'C168');
$isC168ById = false;
if ($company_id) {
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
        $stmt->execute([$company_id]);
        $isC168ById = $stmt->fetchColumn() > 0;
    } catch (PDOException $e) {
        error_log("Failed to check if current company is c168: " . $e->getMessage());
        $isC168ById = false;
    }
}

$hasC168Context = ($isC168ByCode || $isC168ById);

if (!$user_id || !$hasC168Context || !userHasC168AnnouncementPageAccess($user_role)) {
    header("Location: dashboard.php");
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php
    $assetVer = function ($file) {
        $path = __DIR__ . '/' . $file;
        return file_exists($path) ? filemtime($path) : time();
    };
    ?>
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo $assetVer('css/accountCSS.css'); ?>">
    <link rel="stylesheet" href="css/announcement.css?v=<?php echo $assetVer('css/announcement.css'); ?>">
    <title>Announcement Management</title>
    <link rel="stylesheet" href="css/sidebar.css?v=<?php echo $assetVer('css/sidebar.css'); ?>">
    <script src="js/sidebar.js?v=<?php echo $assetVer('js/sidebar.js'); ?>"></script>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body class="announcement-page">
    <?php include 'sidebar.php'; ?>
    <div class="container announcement-page-container">
        <div class="page-header">
            <h1>Announcement and Maintenance Management</h1>
            <!-- 页面切换按钮 -->
            <div class="page-tabs">
                <button type="button" class="page-tab active" data-page="announcement">Announcement</button>
                <button type="button" class="page-tab" data-page="maintenance">Maintenance</button>
            </div>
        </div>
        
        <div class="separator-line"></div>
        
        <!-- Announcement 页面 -->
        <div id="panel-announcement" class="page-panel">
        <div class="announcement-layout">
            <!-- Left: Create Announcement Form -->
            <div class="announcement-form-section">
                <h2 style="margin-top: 0; color: #002C49; font-family: 'Amaranth'; font-size: clamp(16px, 1.25vw, 24px); margin-bottom: clamp(8px, 0.73vw, 14px);">Create New Announcement</h2>
                <form id="announcementForm">
                    <div class="form-group">
                        <label for="title">Title *</label>
                        <input type="text" id="title" name="title" required maxlength="500" placeholder="Enter announcement title">
                    </div>
                    <div class="form-group">
                        <label for="content">Content *</label>
                        <textarea id="content" name="content" required placeholder="Enter announcement content"></textarea>
                    </div>
                    <button type="submit" class="submit-btn">Publish Announcement</button>
                </form>
            </div>

            <!-- Right: Published Announcements List -->
            <div class="announcement-list-section">
                <div class="announcement-list-header">
                    <h2>Published Announcements</h2>
                </div>
                <div id="announcementList" style="flex: 1; overflow-y: auto;">
                    <!-- 公告列表将在这里动态加载 -->
                </div>
            </div>
        </div>
        </div><!-- /#panel-announcement -->

        <!-- Maintenance 页面 -->
        <div id="panel-maintenance" class="page-panel hidden">
        <div class="maintenance-layout">
            <!-- Left: Create Maintenance Content Form -->
            <div class="maintenance-form-section">
                <h2 style="margin-top: 0; color: #002C49; font-family: 'Amaranth'; font-size: clamp(16px, 1.25vw, 24px); margin-bottom: clamp(8px, 0.73vw, 14px);">Create New Maintenance Content</h2>
                <div id="maintenanceFormWarning" style="display: none; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px; margin-bottom: 16px; color: #92400e; font-size: clamp(11px, 0.73vw, 14px);">
                    <strong>⚠️ Notice:</strong> Maintenance content already exists. Please delete the existing content before creating a new one.
                </div>
                <form id="maintenanceForm">
                    <div class="form-group">
                        <label for="maintenanceContent">Content *</label>
                        <textarea id="maintenanceContent" name="content" required placeholder="Enter maintenance content" disabled></textarea>
                    </div>
                    <button type="submit" class="submit-btn" id="maintenanceSubmitBtn" disabled>Publish Maintenance Content</button>
                </form>
            </div>

            <!-- Right: Published Maintenance Content List -->
            <div class="maintenance-list-section">
                <div class="maintenance-list-header">
                    <h2>Published Maintenance Content</h2>
                </div>
                <div id="maintenanceList" style="flex: 1; overflow-y: auto;">
                    <!-- 维护内容列表将在这里动态加载 -->
                </div>
            </div>
        </div>
        </div><!-- /#panel-maintenance -->
    </div>

    <!-- 通知容器 -->
    <div id="notificationContainer"></div>

    <!-- Edit Announcement Modal -->
    <div id="editAnnouncementModal" class="edit-modal">
        <div class="edit-modal-content">
            <div class="edit-modal-header">
                <h2>Edit Announcement</h2>
                <span class="edit-modal-close" onclick="closeEditAnnouncementModal()">&times;</span>
            </div>
            <form id="editAnnouncementForm">
                <input type="hidden" id="editAnnouncementId" name="id">
                <div class="form-group">
                    <label for="editAnnouncementTitle">Title *</label>
                    <input type="text" id="editAnnouncementTitle" name="title" required maxlength="500" placeholder="Enter announcement title">
                </div>
                <div class="form-group">
                    <label for="editAnnouncementContent">Content *</label>
                    <textarea id="editAnnouncementContent" name="content" required placeholder="Enter announcement content"></textarea>
                </div>
                <div class="edit-modal-actions">
                    <button type="button" class="edit-modal-btn edit-modal-btn-cancel" onclick="closeEditAnnouncementModal()">Cancel</button>
                    <button type="submit" class="edit-modal-btn edit-modal-btn-save">Save Changes</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit Maintenance Modal -->
    <div id="editMaintenanceModal" class="edit-modal">
        <div class="edit-modal-content">
            <div class="edit-modal-header">
                <h2>Edit Maintenance Content</h2>
                <span class="edit-modal-close" onclick="closeEditMaintenanceModal()">&times;</span>
            </div>
            <form id="editMaintenanceForm">
                <input type="hidden" id="editMaintenanceId" name="id">
                <div class="form-group">
                    <label for="editMaintenanceContent">Content *</label>
                    <textarea id="editMaintenanceContent" name="content" required placeholder="Enter maintenance content"></textarea>
                </div>
                <div class="edit-modal-actions">
                    <button type="button" class="edit-modal-btn edit-modal-btn-cancel" onclick="closeEditMaintenanceModal()">Cancel</button>
                    <button type="submit" class="edit-modal-btn edit-modal-btn-save">Save Changes</button>
                </div>
            </form>
        </div>
    </div>

    <script src="js/announcement.js?v=<?php echo $assetVer('js/announcement.js'); ?>"></script>
</body>
</html>

