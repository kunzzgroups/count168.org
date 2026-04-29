<?php

/**
 * data_capture_details.processed_amount：按「分」向 0 截断 + 微纠偏的 SQL 片段，
 * 与 history_api 的 historyDataCaptureProcessed2、前端 roundProcessedAmountTo2Decimals 逐行口径一致。
 * 用于 SUM(每行量化) 以与 Payment History 明细累加一致（勿再用 ROUND(x,2) 半入与截断混用）。
 *
 * @param string $col 列全名，如 dcd.processed_amount
 */
function dcd_processed_amount_sql_quant2(string $col = 'dcd.processed_amount'): string
{
    return '(CASE WHEN ' . $col . ' >= 0 THEN FLOOR((' . $col . ' + 0.000000000001) * 100) / 100 ELSE CEIL((' . $col . ' - 0.000000000001) * 100) / 100 END)';
}

/**
 * PHP 侧与 js/datacapturesummary.js roundProcessedAmountTo2Decimals / history_api historyDataCaptureProcessed2 一致：
 * 向 0 截断到分 + epsilon，避免 SUM/JSON 后 float -40.799999… 再被 trunc2 显示成 -40.79。
 */
function dcd_processed_amount_float_quant2(float $value): float
{
    if (!is_finite($value)) {
        return 0.0;
    }
    $epsilon = $value >= 0 ? 1e-9 : -1e-9;
    $scaled = ($value + $epsilon) * 100.0;
    $t = $scaled >= 0 ? floor($scaled) : ceil($scaled);
    $out = $t / 100.0;
    return ($out === 0.0 || $out === -0.0) ? 0.0 : $out;
}
