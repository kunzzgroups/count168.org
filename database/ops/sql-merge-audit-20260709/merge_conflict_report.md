# SQL Merge Conflict Report

- Source DB: `u857194726_count168`
- Target DB: `c168_org`

## Structure Diff

- Tables only in source: **1**
- Tables only in target: **0**
- Tables with schema difference: **85**

### Schema-different tables
- `account`
- `account_backup`
- `account_company`
- `account_company_backup`
- `account_currency`
- `account_currency_backup`
- `account_currency_display_order`
- `account_link`
- `announcements`
- `auto_login_credentials`
- `bank_process`
- `bank_process_accounting_resend_daily_guard`
- `bank_process_accounting_resend_daily_guard_backup`
- `bank_process_backup`
- `bank_process_maintenance_resend_pending`
- `bank_process_maintenance_resend_pending_backup`
- `company`
- `company_auto_renew_request`
- `company_backup`
- `company_countries`
- `company_countries_backup`
- `company_deletion_archive`
- `company_ownership`
- `company_ownership_backup`
- `company_ownership_history`
- `company_selected_bank_backup`
- `company_selected_banks`
- `company_selected_countries`
- `company_selected_countries_backup`
- `country_bank`
- `currency`
- `currency_backup`
- `data_capture_details`
- `data_capture_details_backup`
- `data_capture_draft`
- `data_capture_submit_queue`
- `data_capture_submit_queue_backup`
- `data_capture_summary_state`
- `data_capture_summary_state_backup`
- `data_capture_templates`
- `data_capture_templates_backup`
- `data_captures`
- `data_captures_backup`
- `data_captures_deleted`
- `day`
- `deleted_logs`
- `description`
- `description_backup`
- `domain_list_fee_settings`
- `group_company_map`
- `group_ownership`
- `group_ownership_backup`
- `group_ownership_history`
- `groups`
- `maintenance_marquee`
- `owner`
- `owner_backup`
- `password_reset_tac`
- `password_reset_tac_owner`
- `process`
- `process_accounting_due_dismissed`
- `process_accounting_posted`
- `process_backup`
- `process_day`
- `process_day_backup`
- `role`
- `submitted_processes`
- `submitted_processes_backup`
- `tenant_module_policy`
- `transaction_entry`
- `transaction_entry_backup`
- `transactions`
- `transactions_backup`
- `transactions_deleted`
- `transactions_rate`
- `transactions_rate_backup`
- `transactions_rate_details`
- `transactions_rate_details_backup`
- `user`
- `user_backup`
- `user_company_map`
- `user_company_map_backup`
- `user_company_permission_backup`
- `user_company_permissions`
- `user_group_map`

### Column-set differences (auto-merge skipped)

- `company_auto_renew_request`: source_only=[], target_only=['entity_type', 'group_id']
- `domain_list_fee_settings`: source_only=[], target_only=['company_period_prices', 'company_price', 'group_period_prices', 'group_price']
- `submitted_processes`: source_only=[], target_only=['scope_id', 'scope_type']

## Data Key Conflict (Primary Key)

| table | pk | source_rows | target_rows | source_only_pk | target_only_pk | same_pk_same_data | same_pk_diff_data |
|---|---|---:|---:|---:|---:|---:|---:|
| `submitted_processes` | `id` | 3484 | 3483 | 1 | 0 | 0 | 3483 |
| `data_capture_templates` | `id` | 10159 | 10000 | 159 | 0 | 9933 | 67 |
| `user` | `id` | 81 | 81 | 0 | 0 | 72 | 9 |
| `user_backup` | `id` | 81 | 81 | 0 | 0 | 72 | 9 |
| `user_company_permissions` | `id` | 49 | 49 | 0 | 0 | 42 | 7 |
| `bank_process` | `id` | 110 | 110 | 0 | 0 | 105 | 5 |
| `bank_process_backup` | `id` | 110 | 110 | 0 | 0 | 105 | 5 |
| `owner` | `id` | 11 | 11 | 0 | 0 | 10 | 1 |
| `domain_list_fee_settings` | `id` | 1 | 1 | 0 | 0 | 0 | 1 |
| `data_capture_details_backup` | `backup_id` | 104473 | 104371 | 102 | 0 | 104371 | 0 |
| `data_capture_details` | `id` | 51662 | 51611 | 51 | 0 | 51611 | 0 |
| `data_capture_templates_backup` | `backup_id` | 49522 | 48741 | 781 | 0 | 48741 | 0 |
| `transactions_backup` | `backup_id` | 16949 | 16933 | 16 | 0 | 16933 | 0 |
| `data_captures_backup` | `backup_id` | 15688 | 15686 | 2 | 0 | 15686 | 0 |
| `data_captures` | `id` | 8774 | 8773 | 1 | 0 | 8773 | 0 |
| `transactions` | `id` | 8171 | 8159 | 12 | 0 | 8159 | 0 |
| `deleted_logs` | `id` | 7825 | 7771 | 54 | 0 | 7771 | 0 |
| `data_capture_submit_queue` | `id` | 6944 | 6942 | 2 | 0 | 6942 | 0 |
| `data_capture_submit_queue_backup` | `id` | 6944 | 6942 | 2 | 0 | 6942 | 0 |
| `submitted_processes_backup` | `id` | 3484 | 3483 | 1 | 0 | 3483 | 0 |
| `transaction_entry_backup` | `backup_id` | 3029 | 3021 | 8 | 0 | 3021 | 0 |
| `transactions_deleted` | `id` | 2763 | 2762 | 1 | 0 | 2762 | 0 |
| `process_day` | `id` | 2488 | 2490 | 0 | 2 | 2488 | 0 |
| `process_day_backup` | `id` | 2488 | 2488 | 0 | 0 | 2488 | 0 |
| `account_currency` | `id` | 1573 | 1573 | 0 | 0 | 1573 | 0 |
| `account_currency_backup` | `id` | 1573 | 1573 | 0 | 0 | 1573 | 0 |
| `account` | `id` | 1406 | 1406 | 0 | 0 | 1406 | 0 |
| `account_backup` | `id` | 1406 | 1406 | 0 | 0 | 1406 | 0 |
| `account_company` | `id` | 1359 | 1359 | 0 | 0 | 1359 | 0 |
| `account_company_backup` | `id` | 1359 | 1359 | 0 | 0 | 1359 | 0 |
| `transactions_rate_details_backup` | `backup_id` | 1223 | 1215 | 8 | 0 | 1215 | 0 |
| `data_captures_deleted` | `id` | 1079 | 1078 | 1 | 0 | 1078 | 0 |
| `process` | `id` | 1055 | 1056 | 0 | 1 | 1055 | 0 |
| `process_backup` | `id` | 1055 | 1055 | 0 | 0 | 1055 | 0 |
| `process_accounting_posted` | `id` | 898 | 898 | 0 | 0 | 898 | 0 |
| `description` | `id` | 502 | 502 | 0 | 0 | 502 | 0 |
| `description_backup` | `id` | 502 | 502 | 0 | 0 | 502 | 0 |
| `data_capture_summary_state` | `id` | 479 | 478 | 1 | 0 | 478 | 0 |
| `data_capture_summary_state_backup` | `id` | 479 | 478 | 1 | 0 | 478 | 0 |
| `transactions_rate_details` | `id` | 476 | 468 | 8 | 0 | 468 | 0 |
| `transaction_entry` | `id` | 457 | 449 | 8 | 0 | 449 | 0 |
| `bank_process_maintenance_resend_pending` | `id` | 292 | 292 | 0 | 0 | 292 | 0 |
| `bank_process_maintenance_resend_pending_backup` | `id` | 292 | 292 | 0 | 0 | 292 | 0 |
| `transactions_rate_backup` | `backup_id` | 278 | 276 | 2 | 0 | 276 | 0 |
| `country_bank` | `id` | 182 | 182 | 0 | 0 | 182 | 0 |
| `company_selected_bank_backup` | `company_id,country,bank` | 124 | 124 | 0 | 0 | 124 | 0 |
| `company_selected_banks` | `company_id,country,bank` | 124 | 124 | 0 | 0 | 124 | 0 |
| `transactions_rate` | `id` | 110 | 108 | 2 | 0 | 108 | 0 |
| `account_link` | `id` | 78 | 78 | 0 | 0 | 78 | 0 |
| `user_company_map` | `id` | 61 | 61 | 0 | 0 | 61 | 0 |
| `user_company_map_backup` | `id` | 61 | 61 | 0 | 0 | 61 | 0 |
| `currency` | `id` | 60 | 60 | 0 | 0 | 60 | 0 |
| `currency_backup` | `id` | 60 | 60 | 0 | 0 | 60 | 0 |
| `tenant_module_policy` | `id` | 56 | 56 | 0 | 0 | 56 | 0 |
| `company_selected_countries` | `company_id,country` | 54 | 54 | 0 | 0 | 54 | 0 |
| `company_selected_countries_backup` | `company_id,country` | 54 | 54 | 0 | 0 | 54 | 0 |
| `user_company_permission_backup` | `id` | 49 | 49 | 0 | 0 | 49 | 0 |
| `bank_process_accounting_resend_daily_guard` | `id` | 48 | 48 | 0 | 0 | 48 | 0 |
| `bank_process_accounting_resend_daily_guard_backup` | `id` | 48 | 48 | 0 | 0 | 48 | 0 |
| `company_countries` | `id` | 38 | 38 | 0 | 0 | 38 | 0 |
| `company_countries_backup` | `id` | 38 | 38 | 0 | 0 | 38 | 0 |
| `company` | `id` | 26 | 26 | 0 | 0 | 26 | 0 |
| `company_backup` | `id` | 26 | 26 | 0 | 0 | 26 | 0 |
| `company_ownership` | `id` | 22 | 22 | 0 | 0 | 22 | 0 |
| `company_ownership_backup` | `id` | 22 | 22 | 0 | 0 | 22 | 0 |
| `process_accounting_due_dismissed` | `id` | 20 | 20 | 0 | 0 | 20 | 0 |
| `account_currency_display_order` | `id` | 15 | 15 | 0 | 0 | 15 | 0 |
| `owner_backup` | `id` | 11 | 11 | 0 | 0 | 11 | 0 |
| `role` | `id` | 10 | 10 | 0 | 0 | 10 | 0 |
| `group_company_map` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `group_ownership` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `group_ownership_backup` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `day` | `id` | 7 | 7 | 0 | 0 | 7 | 0 |
| `company_deletion_archive` | `id` | 5 | 5 | 0 | 0 | 5 | 0 |
| `groups` | `id` | 4 | 4 | 0 | 0 | 4 | 0 |
| `password_reset_tac_owner` | `email,owner_id` | 3 | 3 | 0 | 0 | 3 | 0 |
| `data_capture_draft` | `id` | 2 | 2 | 0 | 0 | 2 | 0 |
| `announcements` | `id` | 1 | 1 | 0 | 0 | 1 | 0 |
| `password_reset_tac` | `email,company_id` | 1 | 1 | 0 | 0 | 1 | 0 |
| `company_auto_renew_request` | `id` | 0 | 5 | 0 | 5 | 0 | 0 |

## High-Risk Tables

- same_pk_diff_data > 0 tables: **9**
- `submitted_processes`: 3483
- `data_capture_templates`: 67
- `user`: 9
- `user_backup`: 9
- `user_company_permissions`: 7
- `bank_process`: 5
- `bank_process_backup`: 5
- `owner`: 1
- `domain_list_fee_settings`: 1

