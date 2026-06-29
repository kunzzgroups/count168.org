/** Wrap bare negative numbers in parentheses for formula display. */
export function formatNegativeNumbersInFormula(formula) {
  if (!formula || typeof formula !== "string") {
    return formula;
  }

  return formula.replace(
    /(^|[+\-*/(\s])(-(\d+\.?\d*))/g,
    (match, prefix, negativeNumber, _numberPart, offset, string) => {
      if (prefix === "(") {
        const afterMatch = string.substring(offset + match.length);
        if (afterMatch.startsWith(")")) {
          return match;
        }
      }
      return prefix + `(${negativeNumber})`;
    },
  );
}
