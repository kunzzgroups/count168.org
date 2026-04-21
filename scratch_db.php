<?php
require 'config.php';
$stmt = $pdo->query('SELECT * FROM account_link LIMIT 5');
echo "ACCOUNT_LINK:\n";
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

$stmt2 = $pdo->query("SELECT * FROM data_capture_templates WHERE product_type = 'sub' LIMIT 5");
echo "\nSUB_PRODUCTS:\n";
print_r($stmt2->fetchAll(PDO::FETCH_ASSOC));
