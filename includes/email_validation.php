<?php
/**
 * Real-world email format validation (provider-agnostic).
 * Supports subdomains, + aliases, dots in local part; rejects malformed input.
 */

function normalize_email_input($raw) {
    return strtolower(trim((string) $raw));
}

/**
 * @return array{valid: bool, email: string}
 */
function validate_email_format($raw) {
    $email = normalize_email_input($raw);

    if ($email === '' || strlen($email) > 254) {
        return ['valid' => false, 'email' => $email];
    }

    if (substr_count($email, '@') !== 1) {
        return ['valid' => false, 'email' => $email];
    }

    $atIndex = strpos($email, '@');
    $localPart = substr($email, 0, $atIndex);
    $domainPart = substr($email, $atIndex + 1);

    if ($localPart === '' || strlen($localPart) > 64) {
        return ['valid' => false, 'email' => $email];
    }

    if ($localPart[0] === '.' || substr($localPart, -1) === '.' || strpos($localPart, '..') !== false) {
        return ['valid' => false, 'email' => $email];
    }

    if (!preg_match('/^[a-z0-9._%+-]+$/', $localPart)) {
        return ['valid' => false, 'email' => $email];
    }

    if ($domainPart === '' || strlen($domainPart) > 253) {
        return ['valid' => false, 'email' => $email];
    }

    if (preg_match('/^[.\-]|[.\-]$/', $domainPart)) {
        return ['valid' => false, 'email' => $email];
    }

    $labels = explode('.', $domainPart);
    if (count($labels) < 2) {
        return ['valid' => false, 'email' => $email];
    }

    foreach ($labels as $label) {
        if ($label === '' || strlen($label) > 63) {
            return ['valid' => false, 'email' => $email];
        }
        if ($label[0] === '-' || substr($label, -1) === '-') {
            return ['valid' => false, 'email' => $email];
        }
        if (!preg_match('/^[a-z0-9-]+$/', $label)) {
            return ['valid' => false, 'email' => $email];
        }
    }

    $tld = $labels[count($labels) - 1];
    if (strlen($tld) < 2 || !preg_match('/^[a-z]+$/', $tld)) {
        return ['valid' => false, 'email' => $email];
    }

    if (preg_match('/[<>\'"\\\\;(){}[\\]]/', $email)) {
        return ['valid' => false, 'email' => $email];
    }

    return ['valid' => true, 'email' => $email];
}

function is_valid_email_format($raw) {
    return validate_email_format($raw)['valid'];
}
