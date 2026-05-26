/** Trim and lowercase for submit / validation. */
export function normalizeEmailInput(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Sanitize while typing: no spaces, no CJK, lowercase. */
export function sanitizeEmailInput(value) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[\u4e00-\u9fa5]/g, "")
    .toLowerCase();
}

/**
 * Real-world email format validation (not provider-restricted).
 * Supports subdomains, + aliases, dots in local part.
 * @returns {{ valid: boolean, email: string }}
 */
export function validateEmailFormat(rawValue) {
  const email = normalizeEmailInput(rawValue);

  if (!email || email.length > 254) {
    return { valid: false, email };
  }

  if ((email.match(/@/g) || []).length !== 1) {
    return { valid: false, email };
  }

  const atIndex = email.indexOf("@");
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);

  if (!localPart || localPart.length > 64) {
    return { valid: false, email };
  }

  if (/^\./.test(localPart) || /\.$/.test(localPart) || /\.\./.test(localPart)) {
    return { valid: false, email };
  }

  if (!/^[a-z0-9._%+-]+$/.test(localPart)) {
    return { valid: false, email };
  }

  if (!domainPart || domainPart.length > 253) {
    return { valid: false, email };
  }

  if (/^[.\-]|[.\-]$/.test(domainPart)) {
    return { valid: false, email };
  }

  const labels = domainPart.split(".");
  if (labels.length < 2) {
    return { valid: false, email };
  }

  for (const label of labels) {
    if (!label || label.length > 63) {
      return { valid: false, email };
    }
    if (/^-|-$/.test(label)) {
      return { valid: false, email };
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return { valid: false, email };
    }
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { valid: false, email };
  }

  if (/[<>'"\\;(){}[\]]/.test(email)) {
    return { valid: false, email };
  }

  return { valid: true, email };
}

export function isValidEmailFormat(rawValue) {
  return validateEmailFormat(rawValue).valid;
}
