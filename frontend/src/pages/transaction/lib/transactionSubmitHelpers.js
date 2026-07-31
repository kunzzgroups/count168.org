import {
  formatAmountForStore,
  RATE_STORE_MAX_DECIMALS,
} from "./transactionFormat.js";
import MoneyDecimal from "../../../utils/money/moneyDecimal.js";

export function toNumberLike(raw) {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function cleanAmt(raw) {
  return String(raw ?? "")
    .replace(/,/g, "")
    .trim();
}

function parsePositiveAmt(raw) {
  try {
    const inputStr = cleanAmt(raw);
    if (!inputStr) return MoneyDecimal.toDecimal("0", 0);
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    return dec.gt(0) ? dec : MoneyDecimal.toDecimal("0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

function parseSignedAmt(raw) {
  try {
    return MoneyDecimal.toDecimal(cleanAmt(raw) || "0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

/**
 * Rate-Mul: plain signed number only (e.g. `0.1`, `-0.1`).
 * Division/multiplication expressions (`/0.1`, `*2`) are rejected.
 */
export function parseMiddlemanRateSigned(raw) {
  const cleaned = cleanAmt(raw);
  const zero = MoneyDecimal.toDecimal("0", 0);
  if (!cleaned) return { valid: false, value: zero };
  if (/[*/÷]/.test(cleaned)) return { valid: false, value: zero };
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return { valid: false, value: zero };
  if (cleaned === "." || cleaned === "-" || cleaned === "+" || cleaned === "-." || cleaned === "+.") {
    return { valid: false, value: zero };
  }
  try {
    return { valid: true, value: MoneyDecimal.toDecimal(cleaned, 0) };
  } catch {
    return { valid: false, value: zero };
  }
}

/** FX Rate `/1.71` → divisor Decimal; otherwise null (multiply / compound forms). */
export function parseSimpleDivisionRateDivisor(raw) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  if (!/^\/\d*\.?\d+$/.test(normalized)) return null;
  try {
    const divisor = MoneyDecimal.toDecimal(normalized.slice(1), 0);
    return divisor.gt(0) ? divisor : null;
  } catch {
    return null;
  }
}

/**
 * Rate-Mul commission in second-currency units (full precision; caller stores at 6dp).
 * - Positive Rate-Mul: from × mul
 * - Negative Rate-Mul + FX `/divisor` (complementary spread):
 *   - ε = min(|mul|, divisor−|mul|)
 *   - edge = from/(divisor−ε) − from/divisor
 *   - |mul| ≤ divisor/2 → profit = edge（与旧价差公式相同；中点 = 拿完 base）
 *   - |mul| > divisor/2 → profit = base − edge（与「剩余点数」对调）
 *   - |mul| = divisor → take-all: profit = base
 *   - |mul| > divisor → 0 (caller rejects via isRateMulAdjustedDivisorValid)
 * - Negative Rate-Mul + multiply FX: ignored (0)
 */
export function computeRateMulCommission({ fromAmount, middlemanRate, exchangeRateRaw }) {
  const fromDec = parsePositiveAmt(fromAmount);
  const parsed = parseMiddlemanRateSigned(middlemanRate);
  if (!parsed.valid || fromDec.lte(0) || parsed.value.isZero()) {
    return MoneyDecimal.toDecimal("0", 0);
  }
  const mmr = parsed.value;
  if (mmr.gt(0)) {
    return fromDec.times(mmr);
  }
  const divisor = parseSimpleDivisionRateDivisor(exchangeRateRaw);
  if (!divisor) return MoneyDecimal.toDecimal("0", 0);
  const absMul = mmr.abs();
  const remain = divisor.minus(absMul);
  const base = fromDec.div(divisor);
  // |mul| === divisor → Middle-Man takes entire converted amount (mirror of positive mul = rate).
  if (remain.isZero()) return base;
  if (remain.lt(0)) return MoneyDecimal.toDecimal("0", 0);

  // Complementary: keep legacy spread on the small side; swap when |mul| > divisor/2.
  const eps = absMul.lte(remain) ? absMul : remain;
  const edge = fromDec.div(divisor.minus(eps)).minus(base);
  if (absMul.lte(divisor.div(2))) return edge;
  return base.minus(edge);
}

/** Negative Rate-Mul with `/rate`: adjusted divisor must be ≥ 0 (|mul| ≤ divisor). */
export function isRateMulAdjustedDivisorValid(middlemanRate, exchangeRateRaw) {
  const parsed = parseMiddlemanRateSigned(middlemanRate);
  if (!parsed.valid || !parsed.value.lt(0)) return true;
  const divisor = parseSimpleDivisionRateDivisor(exchangeRateRaw);
  if (!divisor) return true; // multiply FX → ignore negative mul
  return divisor.minus(parsed.value.abs()).gte(0);
}

/** RATE Service Fee remark / desc：charge {第二币种} {用户输入} Service Fees */
export function buildRateServiceFeeRemark(currencyTo, middlemanInputAmount) {
  const inputStr = cleanAmt(middlemanInputAmount);
  if (!inputStr) return "";
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.lte(0)) return "";
  } catch {
    return "";
  }
  const currency = String(currencyTo ?? "").trim().toUpperCase();
  if (!currency) return "";
  return `charge ${currency} ${inputStr} Service Fees`;
}

/** RATE Platform Fee desc：charge {第二币种} {用户输入} PlatForm Fee */
export function buildRatePlatformFeeRemark(currencyTo, platformFeeAmount) {
  const inputStr = cleanAmt(platformFeeAmount);
  if (!inputStr) return "";
  let displayAmount;
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.isZero()) return "";
    displayAmount = dec.abs().toString();
  } catch {
    return "";
  }
  const currency = String(currencyTo ?? "").trim().toUpperCase();
  if (!currency) return "";
  return `charge ${currency} ${displayAmount} PlatForm Fee`;
}

/**
 * Middle-Man profit: rate-mul commission + signed Platform Fee mix (desktop).
 * - PT-Fee > 0 → Fee + PT（正 PT 并入 Middle；From 另扣）
 * - PT-Fee < 0 → Fee − abs(PT)
 * Fee / Platform Fee are face values (no FX multiply).
 * Pass `exchangeRateRaw` so negative Rate-Mul can use the division-rate profit path.
 */
export function computeRateMiddlemanProfit({
  fromAmount,
  middlemanRate,
  feeAmount,
  platformFeeAmount,
  exchangeRateRaw,
}) {
  const rateMulDec = computeRateMulCommission({
    fromAmount,
    middlemanRate,
    exchangeRateRaw,
  });
  const feeDec = parsePositiveAmt(feeAmount);
  const platformSigned = parseSignedAmt(platformFeeAmount);
  const platformAbs = platformSigned.abs();
  let feeNet = feeDec;
  if (platformSigned.gt(0)) {
    feeNet = feeDec.plus(platformAbs);
  } else if (platformSigned.lt(0)) {
    feeNet = feeDec.minus(platformAbs);
  }
  return rateMulDec.plus(feeNet);
}

/** Positive PT-Fee abs for From-amount deduction; otherwise 0. */
export function positivePlatformFeeDeduction(platformFeeAmount) {
  const platformSigned = parseSignedAmt(platformFeeAmount);
  return platformSigned.gt(0) ? platformSigned.abs() : MoneyDecimal.toDecimal("0", 0);
}

/** Negative PT-Fee abs credited on From via separate Fee row; otherwise 0. */
export function negativePlatformFeeCredit(platformFeeAmount) {
  const platformSigned = parseSignedAmt(platformFeeAmount);
  return platformSigned.lt(0) ? platformSigned.abs() : MoneyDecimal.toDecimal("0", 0);
}

/**
 * RATE submit payload aligned with `js/transaction.js` submitAction + `api/transactions/submit_api.php` expectations.
 * Amounts are truncated to 6dp for storage (no round-2). `formatRateAmount` is display-only elsewhere.
 * `toGrossStr` is a fallback when rate/from cannot rebuild gross (e.g. missing rate).
 */
export function buildRatePayload({
  toId,
  fromId,
  fromAmt,
  toGrossStr,
  rateDate,
  txRemark,
  rateCurrencyFrom,
  rateCurrencyTo,
  parsedRateNormalizedStr,
  rateMiddlemanRate,
  rateMiddlemanAmount,
  rateMiddlemanAccount,
  rateExchangeRateRaw,
  rateFromAccount,
  rateToAccount,
  rateTransferToAccount,
  rateTransferFromAccount,
  rateMiddlemanInputAmount,
  rateMiddlemanPlatformFee,
}) {
  const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
  const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
  const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";
  const store = (v) => formatAmountForStore(v, RATE_STORE_MAX_DECIMALS);

  const fromDec = MoneyDecimal.toDecimal(cleanAmt(fromAmt) || "0", 0);

  // Rebuild gross at full precision (UI may have rounded toGrossStr to 2dp for display).
  let grossDec;
  try {
    const rateDec = MoneyDecimal.toDecimal(cleanAmt(parsedRateNormalizedStr) || "0", 0);
    if (fromDec.gt(0) && rateDec.gt(0)) {
      grossDec = fromDec.times(rateDec);
      try {
        const feeInputDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanInputAmount) || "0", 0);
        if (feeInputDec.lt(0)) {
          grossDec = grossDec.plus(feeInputDec);
        }
      } catch {
        // ignore fee adjust
      }
    } else {
      grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);
    }
  } catch {
    grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);
  }

  // Prefer recomputed middleman profit so store precision is not lost to display round-2.
  let middleDec = computeRateMiddlemanProfit({
    fromAmount: fromAmt,
    middlemanRate: rateMiddlemanRate,
    feeAmount: rateMiddlemanInputAmount,
    platformFeeAmount: rateMiddlemanPlatformFee,
    exchangeRateRaw: rateExchangeRateRaw,
  });
  if (middleDec.isZero() && cleanAmt(rateMiddlemanAmount)) {
    try {
      middleDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanAmount) || "0", 0);
    } catch {
      middleDec = MoneyDecimal.toDecimal("0", 0);
    }
  }

  const platformInputDec = parseSignedAmt(rateMiddlemanPlatformFee);

  // Rate-mul commission only (excludes fee / platform fee).
  const rateMulDec = computeRateMulCommission({
    fromAmount: fromAmt,
    middlemanRate: rateMiddlemanRate,
    exchangeRateRaw: rateExchangeRateRaw,
  });

  const fromCode = rateFromAccount?.account_id || "";
  const toCode = rateToAccount?.account_id || "";
  const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
  const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

  const transferFromCode = rateTransferFromAccount?.account_id || "";
  const transferToCode = rateTransferToAccount?.account_id || "";
  const transferFromDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;
  const transferToDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;

  const middleDesc =
    middleId && !middleDec.isZero()
      ? `Rate charge (x${rateMiddlemanRate}) from ${rateCurrencyFrom} ${MoneyDecimal.formatFixed(fromDec.toString(), 2)}`
      : "";

  const platformFeeRemark = buildRatePlatformFeeRemark(rateCurrencyTo, rateMiddlemanPlatformFee);
  // Service Fee → embedded in To/From amounts (desktop skips From RATE_FEE + sms).
  const sms = String(txRemark || "").toUpperCase();

  const storeFrom = store(fromDec.toString());
  const storeGross = store(grossDec.toString());

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: storeFrom,
    transaction_date: rateDate,
    description: "",
    sms,
    currency: rateCurrencyFrom,

    rate_from_account_id: fromId,
    rate_from_currency: rateCurrencyFrom,
    rate_from_amount: storeFrom,
    rate_from_description: fromDesc,

    rate_to_account_id: toId,
    rate_to_currency: rateCurrencyTo,
    rate_to_amount: storeGross,
    rate_to_description: toDesc,

    rate_currency_from: rateCurrencyFrom,
    rate_currency_from_amount: storeFrom,
    rate_currency_to: rateCurrencyTo,
    rate_currency_to_amount: storeGross,
    rate_exchange_rate: String(parsedRateNormalizedStr ?? ""),

    rate_middleman_rate: rateMiddlemanRate,
    rate_middleman_amount: !middleDec.isZero() ? store(middleDec.toString()) : "",
    rate_middleman_account: middleId,
    rate_middleman_input_amount: rateMiddlemanInputAmount ? cleanAmt(rateMiddlemanInputAmount) : "",
    rate_middleman_platform_fee: rateMiddlemanPlatformFee ? cleanAmt(rateMiddlemanPlatformFee) : "",

    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    // To = full gross（已含 Service Fee 口径，不另扣）
    // From RATE = gross − rateMul − Service Fee − max(PT,0)（Fee 只扣进 From 金额，不写 From 的 RATE_FEE 行）
    // 正 PT：扣 From RATE；Middle = Fee+PT
    // 负 PT：From RATE 展示/入库保持（如 300）；History 另写 PLATFORM_FEE +|PT|（Balance 可到 301.5）
    const transferBase = grossDec;
    const serviceFeeDec = parsePositiveAmt(rateMiddlemanInputAmount);
    const positivePtDec = positivePlatformFeeDeduction(rateMiddlemanPlatformFee);
    const transferToSide = transferBase;
    let transferFromSide = transferBase;
    if (middleId && rateMulDec.gt(0)) {
      transferFromSide = transferBase.minus(rateMulDec);
    }
    if (serviceFeeDec.gt(0)) {
      transferFromSide = transferFromSide.minus(serviceFeeDec);
    }
    if (positivePtDec.gt(0)) {
      transferFromSide = transferFromSide.minus(positivePtDec);
    }

    payload.rate_transfer_from_account_id = transferToId;
    payload.rate_transfer_from_currency = rateCurrencyTo;
    payload.rate_transfer_from_amount = store(transferToSide.toString());
    payload.rate_transfer_from_description = transferFromDesc;

    payload.rate_transfer_to_account_id = transferFromId;
    payload.rate_transfer_to_currency = rateCurrencyTo;
    payload.rate_transfer_to_amount = store(transferFromSide.toString());
    payload.rate_transfer_to_description = transferToDesc;

    payload.rate_transfer_from_account = transferToId;
    payload.rate_transfer_to_account = transferFromId;

    if (middleId && !middleDec.isZero()) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = store(middleDec.toString());
      payload.rate_middleman_description = middleDesc;
    }

    // Desktop: negative PT → History Fee 行 (+abs) on From；表单金额不预加。
    if (platformInputDec.lt(0)) {
      payload.rate_platform_fee_amount = store(platformInputDec.toString());
      payload.rate_platform_fee_description =
        platformFeeRemark ||
        `charge ${String(rateCurrencyTo ?? "").trim().toUpperCase()} ${store(platformInputDec.abs().toString())} PlatForm Fee`;
      payload.rate_platform_fee_from_credit = "1";
    }
  }

  // Ensure skip flag survives even if transfer block early-returned somehow.
  payload.rate_skip_from_service_fee = "1";

  return { payload, middleId };
}

/** Account DB ids involved in a submit — used for post-submit focused list (To + From, RATE legs, etc.). */
export function collectSubmitFocusAccountIds({
  txType,
  toAccountId,
  fromAccountId,
  isAdjustment = false,
  rateToAccountId,
  rateFromAccountId,
  rateTransferToAccountId,
  rateTransferFromAccountId,
  rateMiddlemanAccountId,
} = {}) {
  const ids = new Set();
  const add = (id) => {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  };

  const type = String(txType || "").toUpperCase().trim();
  if (type === "RATE") {
    add(rateToAccountId);
    add(rateFromAccountId);
    add(rateTransferToAccountId);
    add(rateTransferFromAccountId);
    add(rateMiddlemanAccountId);
    return [...ids];
  }

  add(toAccountId);
  if (!isAdjustment) add(fromAccountId);
  return [...ids];
}

/**
 * Cr/Dr (or Win/Loss) deltas for optimistic list update after approved submit.
 * CONTRA/PAYMENT/CLAIM/CLEAR/RECEIVE: To −amount, From +amount.
 * ADJUSTMENT: To += signed amount.
 * WIN/LOSE: amounts go to win_loss (To/From signs per period search).
 */
export function buildOptimisticSubmitDeltas({
  txType,
  amount,
  toAccountId,
  fromAccountId,
} = {}) {
  const type = String(txType || "").toUpperCase().trim();
  if (!type || type === "RATE") return [];

  let amtStr;
  try {
    const cleaned = MoneyDecimal.cleanMoneyInput(amount);
    if (!cleaned) return [];
    amtStr = MoneyDecimal.toDecimal(cleaned).toString();
  } catch {
    return [];
  }

  const toId = Number(toAccountId);
  const fromId = Number(fromAccountId);
  const deltas = [];
  const push = (id, patch) => {
    if (Number.isFinite(id) && id > 0) deltas.push({ accountDbId: id, ...patch });
  };

  if (type === "ADJUSTMENT") {
    push(toId, { crDrDelta: amtStr });
    return deltas;
  }

  if (type === "WIN" || type === "LOSE") {
    const absAmt = MoneyDecimal.abs(amtStr).toString();
    // Period search: To WIN −amount / LOSE +amount; From WIN +amount / LOSE −amount.
    if (type === "WIN") {
      push(toId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
      push(fromId, { winLossDelta: absAmt });
    } else {
      push(toId, { winLossDelta: absAmt });
      push(fromId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
    }
    return deltas;
  }

  if (["CONTRA", "PAYMENT", "CLAIM", "CLEAR", "RECEIVE"].includes(type)) {
    push(toId, { crDrDelta: MoneyDecimal.sub("0", amtStr).toString() });
    push(fromId, { crDrDelta: amtStr });
  }

  return deltas;
}
