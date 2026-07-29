/** Text transforms applied to captured grid before summary rows are built. */

import { parseRemoveWordChips } from "../../../lib/removeWordChips.js";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove whole tokens only — ASCII alnum/`_` neighbors block a match so short
 * codes (XX123) do not carve into longer ones (XX1234). CJK neighbors do not
 * block, so Chinese remove-words still work inside Chinese phrases.
 */
function buildRemoveWordRegex(word) {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(word)}(?![A-Za-z0-9_])`, "gi");
}

export function applyTextTransformations(text, removeWord, replaceWordFrom, replaceWordTo) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  if (removeWord && removeWord.trim() !== "") {
    const wordsToRemove = parseRemoveWordChips(removeWord).sort((a, b) => b.length - a.length);
    wordsToRemove.forEach((word) => {
      result = result.replace(buildRemoveWordRegex(word), "");
    });
  }

  if (replaceWordFrom && replaceWordFrom.trim() !== "" && replaceWordTo !== undefined) {
    const replaceRegex = new RegExp(escapeRegex(replaceWordFrom.trim()), "gi");
    result = result.replace(replaceRegex, replaceWordTo);
  }

  return result.trim();
}

export function applyTransformationsToTableData(tableData, removeWord, replaceWordFrom, replaceWordTo) {
  const transformedData = JSON.parse(JSON.stringify(tableData));

  if (transformedData.rows?.length > 0) {
    transformedData.rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell.type === "data" && cell.value) {
          cell.value = applyTextTransformations(
            cell.value,
            removeWord,
            replaceWordFrom,
            replaceWordTo
          );
        }
      });
    });
  }

  return transformedData;
}

/** Normalize process metadata from capturedProcessData localStorage blob. */
export function parseSummaryProcessMeta(processData) {
  if (!processData || typeof processData !== "object") {
    return { processId: null, processCode: null, processData: null };
  }

  const processCodeRaw = processData.processCode ?? processData.process_code ?? "";
  const processCode =
    typeof processCodeRaw === "string" && processCodeRaw.trim() !== "" ? processCodeRaw.trim() : null;

  const rawProcess =
    processData.process ?? processData.processId ?? processData.process_id ?? null;
  const parsed = rawProcess != null ? Number.parseInt(String(rawProcess), 10) : Number.NaN;
  const processId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  const normalized = { ...processData };
  if (processId != null) normalized.process = processId;

  return { processId, processCode, processData: normalized };
}

export function formatSummaryProcessDescriptions(processData) {
  if (!processData) return "-";
  if (Array.isArray(processData.descriptions) && processData.descriptions.length > 0) {
    return processData.descriptions.join(", ");
  }
  return "-";
}

export function formatSummaryProcessCurrency(processData) {
  if (!processData) return "-";
  const value = processData.currencyName || processData.currency;
  return value != null && String(value).trim() !== "" ? String(value).trim() : "-";
}
