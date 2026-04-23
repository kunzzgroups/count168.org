<?php
/**
 * PHP Configuration Checker
 * 用于检查 PHP 配置是否已正确设置以支持大量数据提交
 * 
 * 访问此文件可以查看当前的 PHP 配置值
 */

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head>
    <title>PHP 配置检查</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .config-table {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #4CAF50;
            color: white;
        }
        .ok {
            color: #4CAF50;
            font-weight: bold;
        }
        .warning {
            color: #ff9800;
            font-weight: bold;
        }
        .error {
            color: #f44336;
            font-weight: bold;
        }
        .info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
        }
    </style>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="config-table">
        <h1>PHP 配置检查</h1>
        <p>此页面显示当前的 PHP 配置值，用于诊断数据提交问题。</p>
        
        <?php
        function return_bytes($val) {
            $val = trim($val);
            $last = strtolower($val[strlen($val)-1]);
            $val = (int)$val;
            switch($last) {
                case 'g':
                    $val *= 1024;
                case 'm':
                    $val *= 1024;
                case 'k':
                    $val *= 1024;
            }
            return $val;
        }
        
        function format_bytes($bytes) {
            if ($bytes >= 1073741824) {
                return number_format($bytes / 1073741824, 2) . ' GB';
            } elseif ($bytes >= 1048576) {
                return number_format($bytes / 1048576, 2) . ' MB';
            } elseif ($bytes >= 1024) {
                return number_format($bytes / 1024, 2) . ' KB';
            } else {
                return $bytes . ' bytes';
            }
        }
        
        $configs = [
            'post_max_size' => ['当前值' => ini_get('post_max_size'), '推荐值' => '64M', '说明' => 'POST 数据最大大小'],
            'upload_max_filesize' => ['当前值' => ini_get('upload_max_filesize'), '推荐值' => '64M', '说明' => '文件上传最大大小'],
            'max_input_vars' => ['当前值' => ini_get('max_input_vars'), '推荐值' => '5000', '说明' => '最大输入变量数量'],
            'max_input_time' => ['当前值' => ini_get('max_input_time'), '推荐值' => '300', '说明' => '最大输入时间（秒）'],
            'max_execution_time' => ['当前值' => ini_get('max_execution_time'), '推荐值' => '300', '说明' => '最大执行时间（秒）'],
            'memory_limit' => ['当前值' => ini_get('memory_limit'), '推荐值' => '256M', '说明' => '内存限制'],
        ];
        ?>
        
        <table>
            <thead>
                <tr>
                    <th>配置项</th>
                    <th>当前值</th>
                    <th>推荐值</th>
                    <th>状态</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($configs as $key => $config): 
                    $current = $config['当前值'];
                    $recommended = $config['推荐值'];
                    
                    // 比较值（转换为字节进行比较）
                    $currentBytes = return_bytes($current);
                    $recommendedBytes = return_bytes($recommended);
                    
                    if ($key === 'max_input_vars' || $key === 'max_input_time' || $key === 'max_execution_time') {
                        // 对于数字值，直接比较
                        $status = ($current >= (int)$recommended) ? 'ok' : 'warning';
                    } else {
                        // 对于大小值，比较字节
                        $status = ($currentBytes >= $recommendedBytes) ? 'ok' : 'warning';
                    }
                    
                    $statusText = $status === 'ok' ? '✓ 正常' : '⚠ 需要调整';
                    $statusClass = $status === 'ok' ? 'ok' : 'warning';
                ?>
                <tr>
                    <td><?php echo htmlspecialchars($config['说明']); ?></td>
                    <td><strong><?php echo htmlspecialchars($current); ?></strong></td>
                    <td><?php echo htmlspecialchars($recommended); ?></td>
                    <td class="<?php echo $statusClass; ?>"><?php echo $statusText; ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        
        <div class="info">
            <h3>说明：</h3>
            <ul>
                <li><strong>✓ 正常</strong>：当前配置值已达到或超过推荐值，应该可以正常提交大量数据。</li>
                <li><strong>⚠ 需要调整</strong>：当前配置值低于推荐值，可能需要调整。</li>
                <li>如果配置值不正确，请检查 <code>.htaccess</code> 文件是否已正确创建，或联系服务器管理员。</li>
                <li>某些共享主机可能不允许在 <code>.htaccess</code> 中设置 PHP 配置，需要联系主机提供商。</li>
            </ul>
        </div>
        
        <div class="info" style="background: #fff3cd; margin-top: 20px;">
            <h3>如何修复：</h3>
            <ol>
                <li>确保项目根目录下有 <code>.htaccess</code> 文件，包含推荐的配置值。</li>
                <li>如果 <code>.htaccess</code> 不生效，可能需要：
                    <ul>
                        <li>联系服务器管理员修改 <code>php.ini</code> 文件</li>
                        <li>或通过服务器控制面板（如 cPanel）修改 PHP 配置</li>
                    </ul>
                </li>
                <li>修改配置后，可能需要等待几分钟让配置生效，或重启服务器。</li>
            </ol>
        </div>
    </div>
</body>
</html>

