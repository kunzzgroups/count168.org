/** Remove comma thousands separators from numeric strings. */
export function removeThousandsSeparators(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/,/g, "");
}

/**
 * Parse id_product:row_label:column or id_product:column references.
 * id_product may contain colons (e.g. G8:GAMEPLAY ...).
 */
export function parseIdProductColumnRef(part) {
  const p = (part || "").trim();
  if (!p) return null;

  const lastColon = p.lastIndexOf(":");
  if (lastColon <= 0) return null;

  const colPart = p.substring(lastColon + 1);
  const dataColumnIndex = Number.parseInt(colPart, 10);
  if (Number.isNaN(dataColumnIndex) || colPart !== String(dataColumnIndex)) return null;

  const rest = p.substring(0, lastColon);
  const rowIdxSegMatch = rest.match(/:#(\d+)$/);
  if (rowIdxSegMatch) {
    const captureRowIndex = Number.parseInt(rowIdxSegMatch[1], 10);
    const idProduct = rest.substring(0, rest.length - rowIdxSegMatch[0].length);
    return { idProduct, rowLabel: null, dataColumnIndex, captureRowIndex };
  }

  const rowLabelMatch = rest.match(/:([A-Z]+)$/);
  let idProduct;
  let rowLabel = null;
  if (rowLabelMatch) {
    rowLabel = rowLabelMatch[1];
    idProduct = rest.substring(0, rest.length - rowLabel.length - 1);
  } else {
    idProduct = rest;
  }

  return { idProduct, rowLabel, dataColumnIndex, captureRowIndex: null };
}

export function isNewIdProductColumnFormat(sourceColumnsValue) {
  if (!sourceColumnsValue || sourceColumnsValue.trim() === "") {
    return false;
  }
  const parts = sourceColumnsValue.split(/\s+/).filter((c) => c.trim() !== "");
  if (parts.length === 0) {
    return false;
  }
  return parseIdProductColumnRef(parts[0]) !== null;
}

/** Parse source columns input (e.g. "5+4" -> columnNumbers + operators). */
export function parseSourceColumnsInput(input) {
  try {
    let normalized = input.replace(/[（）]/g, (match) => (match === "（" ? "(" : ")"));
    const inputWithoutSpaces = normalized.replace(/\s+/g, "");

    const numbers = [];
    const operators = [];
    let currentNumber = "";
    let parenthesesDepth = 0;

    for (let i = 0; i < inputWithoutSpaces.length; i += 1) {
      const char = inputWithoutSpaces[i];

      if (char === "(") {
        if (currentNumber) {
          numbers.push(Number.parseInt(currentNumber, 10));
          currentNumber = "";
        }
        parenthesesDepth += 1;
      } else if (char === ")") {
        if (currentNumber) {
          numbers.push(Number.parseInt(currentNumber, 10));
          currentNumber = "";
        }
        parenthesesDepth -= 1;
      } else if (/[0-9]/.test(char)) {
        currentNumber += char;
      } else if (/[+\-*/]/.test(char)) {
        if (currentNumber) {
          numbers.push(Number.parseInt(currentNumber, 10));
          currentNumber = "";
        }
        operators.push(char);
      }
    }

    if (currentNumber) {
      numbers.push(Number.parseInt(currentNumber, 10));
    }

    const validNumbers = numbers.filter((n) => !Number.isNaN(n));
    if (validNumbers.length === 0) {
      return null;
    }

    return {
      columnNumbers: validNumbers,
      operators: operators.join(""),
      originalInput: inputWithoutSpaces,
      hasParentheses: /[()]/.test(inputWithoutSpaces),
    };
  } catch (error) {
    console.error("Error parsing source columns input:", error);
    return null;
  }
}

/** Split trailing *(sourcePercent) from a stored complete formula string. */
export function parseCompleteFormula(completeFormula) {
  if (!completeFormula || !completeFormula.trim()) {
    return { baseFormula: "", sourcePercent: "" };
  }

  let formula = completeFormula.trim();
  let sourcePercent = "";

  const lastStarIndex = formula.lastIndexOf("*");
  if (lastStarIndex >= 0) {
    const beforeStar = formula.substring(0, lastStarIndex);
    const afterStar = formula.substring(lastStarIndex);
    const openParens = (beforeStar.match(/\(/g) || []).length;
    const closeParens = (beforeStar.match(/\)/g) || []).length;
    const isStarInsideParens = openParens > closeParens;
    const trailingPattern = /^\*\s*\(([0-9.+\-*/\s]+)\)\s*$/;
    const trailingMatch = afterStar.match(trailingPattern);

    if (!isStarInsideParens && trailingMatch) {
      sourcePercent = trailingMatch[1].trim();
      formula = beforeStar.trim();
    }
  }

  return { baseFormula: formula, sourcePercent };
}

/** Wrap bare negative numbers in parentheses for formula display. */
export function formatNegativeNumbersInFormula(formula) {
  if (!formula || typeof formula !== "string") {
    return formula;
  }

  return formula.replace(/(^|[+\-*/(\s])(-(\d+\.?\d*))/g, (match, prefix, negativeNumber, _numberPart, offset, string) => {
    if (prefix === "(") {
      const afterMatch = string.substring(offset + match.length);
      if (afterMatch.startsWith(")")) {
        return match;
      }
    }
    return prefix + `(${negativeNumber})`;
  });
}
