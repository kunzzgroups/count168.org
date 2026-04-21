<?php
require 'config.php';
$stmt = $pdo->query("SELECT a.id, a.account_id, ac.company_id FROM account a LEFT JOIN account_company ac ON a.id = ac.account_id WHERE a.account_id = 'AG110'");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));

$stmt2 = $pdo->query("SELECT id, transaction_type, account_id, from_account_id, amount, currency_id FROM transactions WHERE account_id IN (SELECT id FROM account WHERE account_id='AG110') OR from_account_id IN (SELECT id FROM account WHERE account_id='AG110')");
print_r($stmt2->fetchAll(PDO::FETCH_ASSOC));
