import { formatRateAmount } from "./transactionFormat.js";
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
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.lte(0)) return "";
  } catch {
    return "";
  }
  const currency = String(currencyTo ?? "").trim().toUpperCase();
  if (!currency) return "";
  return `charge ${currency} ${inputStr} PlatForm Fee`;
}

/**
 * Middle-Man profit: rate-mul commission + (Fee − Platform Fee).
 * Fee / Platform Fee are face values (no FX multiply).
 */
export function computeRateMiddlemanProfit({
  fromAmount,
  middlemanRate,
  feeAmount,
  platformFeeAmount,
}) {
  const fromDec = parsePositiveAmt(fromAmount);
  let rateMulDec = MoneyDecimal.toDecimal("0", 0);
  try {
    const mmrDec = MoneyDecimal.toDecimal(cleanAmt(middlemanRate) || "0", 0);
    if (fromDec.gt(0) && mmrDec.gt(0)) {
      rateMulDec = fromDec.times(mmrDec);
    }
  } catch {
    // ignore
  }
  const feeDec = parsePositiveAmt(feeAmount);
  const platformDec = parsePositiveAmt(platformFeeAmount);
  return rateMulDec.plus(feeDec.minus(platformDec));
}

/**
 * RATE submit payload aligned with `js/transaction.js` submitAction + `api/transactions/submit_api.php` expectations.
 * `toGrossStr` = gross converted amount (half-up 2dp string), same role as legacy `dataset.grossAmount` / getRateCurrencyToGrossAmount.
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

  const fromDec = MoneyDecimal.toDecimal(cleanAmt(fromAmt) || "0", 0);
  const grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);

  let middleDec;
  try {
    middleDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanAmount) || "0", 0);
  } catch {
    middleDec = MoneyDecimal.toDecimal("0", 0);
  }
  if (middleDec.isZero()) middleDec = MoneyDecimal.toDecimal("0", 0);

  const feeDec = parsePositiveAmt(rateMiddlemanInputAmount);
  const platformDec = parsePositiveAmt(rateMiddlemanPlatformFee);

  // Rate-mul commission only (excludes fee / platform fee).
  let rateMulDec = MoneyDecimal.toDecimal("0", 0);
  try {
    const mmrDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanRate) || "0", 0);
    if (fromDec.gt(0) && mmrDec.gt(0)) {
      rateMulDec = fromDec.times(mmrDec);
    }
  } catch {
    // ignore
  }

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

  const serviceFeeRemark = buildRateServiceFeeRemark(rateCurrencyTo, rateMiddlemanInputAmount);
  const platformFeeRemark = buildRatePlatformFeeRemark(rateCurrencyTo, rateMiddlemanPlatformFee);
  const serviceFeeDesc = serviceFeeRemark
    ? `Charge ${String(rateCurrencyTo ?? "")
        .trim()
        .toUpperCase()} ${cleanAmt(rateMiddlemanInputAmount)} Service Fees`
    : "";
  const sms = serviceFeeRemark || String(txRemark || "").toUpperCase();

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: formatRateAmount(fromDec.toString()),
    transaction_date: rateDate,
    description: "",
    sms,
    currency: rateCurrencyFrom,

    rate_from_account_id: fromId,
    rate_from_currency: rateCurrencyFrom,
    rate_from_amount: formatRateAmount(fromDec.toString()),
    rate_from_description: fromDesc,

    rate_to_account_id: toId,
    rate_to_currency: rateCurrencyTo,
    rate_to_amount: formatRateAmount(grossDec.toString()),
    rate_to_description: toDesc,

    rate_currency_from: rateCurrencyFrom,
    rate_currency_from_amount: formatRateAmount(fromDec.toString()),
    rate_currency_to: rateCurrencyTo,
    rate_currency_to_amount: formatRateAmount(grossDec.toString()),
    rate_exchange_rate: String(parsedRateNormalizedStr ?? ""),

    rate_middleman_rate: rateMiddlemanRate,
    rate_middleman_amount: rateMiddlemanAmount ? formatRateAmount(middleDec.toString()) : "",
    rate_middleman_account: middleId,
    rate_middleman_input_amount: rateMiddlemanInputAmount ? cleanAmt(rateMiddlemanInputAmount) : "",
    rate_middleman_platform_fee: rateMiddlemanPlatformFee ? cleanAmt(rateMiddlemanPlatformFee) : "",

    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    // Exchange legs use full gross. Fee / Platform Fee are separate + rows on second From.
    // Rate-mul commission still reduces the From transfer side only.
    const transferBase = grossDec;
    let transferToSide = transferBase;
    let transferFromSide = transferBase;
    if (middleId && rateMulDec.gt(0)) {
      transferFromSide = transferBase.minus(rateMulDec);
    }

    payload.rate_transfer_from_account_id = transferToId;
    payload.rate_transfer_from_currency = rateCurrencyTo;
    payload.rate_transfer_from_amount = formatRateAmount(transferToSide.toString());
    payload.rate_transfer_from_description = transferFromDesc;

    payload.rate_transfer_to_account_id = transferFromId;
    payload.rate_transfer_to_currency = rateCurrencyTo;
    payload.rate_transfer_to_amount = formatRateAmount(transferFromSide.toString());
    payload.rate_transfer_to_description = transferToDesc;

    payload.rate_transfer_from_account = transferToId;
    payload.rate_transfer_to_account = transferFromId;

    if (middleId && !middleDec.isZero()) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = formatRateAmount(middleDec.toString());
      payload.rate_middleman_description = middleDesc;
    }

    if (feeDec.gt(0)) {
      payload.rate_service_fee_amount = formatRateAmount(feeDec.toString());
      payload.rate_service_fee_description =
        serviceFeeDesc || `Charge ${String(rateCurrencyTo ?? "").trim().toUpperCase()} ${formatRateAmount(feeDec.toString())} Service Fees`;
    }
    if (platformDec.gt(0)) {
      payload.rate_platform_fee_amount = formatRateAmount(platformDec.toString());
      payload.rate_platform_fee_description =
        platformFeeRemark || `charge ${String(rateCurrencyTo ?? "").trim().toUpperCase()} ${formatRateAmount(platformDec.toString())} PlatForm Fee`;
    }
  }

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
