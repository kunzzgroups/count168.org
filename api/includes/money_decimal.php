<?php
declare(strict_types=1);

const MONEY_SCALE = 8;
const MONEY_CALC_SCALE = 16;

function money_require_bc(): void
{
    if (!function_exists('bcadd')) {
        throw new RuntimeException('PHP BC Math extension is required for money calculations');
    }
}

function money_clean($value): string
{
    if ($value === null) {
        return '';
    }
    $s = trim((string) $value);
    if ($s === '') {
        return '';
    }
    $negativeByParentheses = false;
    if (preg_match('/^\(.*\)$/', $s)) {
        $negativeByParentheses = true;
        $s = substr($s, 1, -1);
    }
    $s = str_replace([',', '$', ' '], '', $s);
    if ($negativeByParentheses && strpos($s, '-') !== 0) {
        $s = '-' . $s;
    }
    return $s;
}

function money_is_valid($value): bool
{
    $s = money_clean($value);
    return $s !== '' && preg_match('/^-?(?:\d+|\d*\.\d+)$/', $s) === 1;
}

function money_normalize($value, int $scale = MONEY_SCALE): string
{
    money_require_bc();
    if (!money_is_valid($value)) {
        throw new InvalidArgumentException('Invalid money value');
    }
    $s = money_clean($value);
    $normalized = bcadd($s, '0', $scale);
    if (preg_match('/^-0(?:\.0+)?$/', $normalized)) {
        return bcadd('0', '0', $scale);
    }
    return $normalized;
}

function money_optional($value, int $scale = MONEY_SCALE): ?string
{
    if ($value === null || trim((string) $value) === '') {
        return null;
    }
    return money_normalize($value, $scale);
}

function money_strip_zeros($value): string
{
    $s = (string) $value;
    if (strpos($s, '.') !== false) {
        $s = rtrim(rtrim($s, '0'), '.');
    }
    return $s === '-0' ? '0' : $s;
}

function money_out($value, int $scale = MONEY_SCALE): string
{
    return money_strip_zeros(money_normalize($value, $scale));
}

function money_add($a, $b, int $scale = MONEY_SCALE): string
{
    money_require_bc();
    return bcadd(money_normalize($a, MONEY_CALC_SCALE), money_normalize($b, MONEY_CALC_SCALE), $scale);
}

function money_sub($a, $b, int $scale = MONEY_SCALE): string
{
    money_require_bc();
    return bcsub(money_normalize($a, MONEY_CALC_SCALE), money_normalize($b, MONEY_CALC_SCALE), $scale);
}

function money_mul($a, $b, int $scale = MONEY_SCALE): string
{
    money_require_bc();
    return bcmul(money_normalize($a, MONEY_CALC_SCALE), money_normalize($b, MONEY_CALC_SCALE), $scale);
}

function money_div($a, $b, int $scale = MONEY_SCALE): string
{
    money_require_bc();
    $divisor = money_normalize($b, MONEY_CALC_SCALE);
    if (bccomp($divisor, '0', MONEY_CALC_SCALE) === 0) {
        throw new InvalidArgumentException('Division by zero');
    }
    return bcdiv(money_normalize($a, MONEY_CALC_SCALE), $divisor, $scale);
}

function money_cmp($a, $b, int $scale = MONEY_SCALE): int
{
    money_require_bc();
    return bccomp(money_normalize($a, $scale), money_normalize($b, $scale), $scale);
}

function money_abs($value, int $scale = MONEY_SCALE): string
{
    $s = money_normalize($value, $scale);
    return strpos($s, '-') === 0 ? substr($s, 1) : $s;
}
?>
