/**
 * Over-select ("drag to end") plain-text paste fixtures.
 * Expect: keep complete dense rows; drop truncated trailing tokens / paginator.
 * Run: node ./scripts/repro-overselect-paste.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const { sanitizePasteMatrix } = await import(
  pathToFileURL(path.join(base, "dataCapturePasteMatrixSanitize.js")).href,
);

function assertMatrix(name, plain, expectRows, expectCols, opts = {}) {
  const matrix = parsePlainTextMatrix(plain);
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const isNx1 = rows > 1 && cols === 1;
  const okRows = rows === expectRows;
  const okCols = cols === expectCols;
  const okNoVertical = opts.allowVertical || !isNx1;
  const okFirstNum = opts.firstNumCol == null || matrix[0]?.[opts.firstNumCol] === opts.firstNumValue;
  const ok = okRows && okCols && okNoVertical && okFirstNum;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: got ${rows}x${cols}` +
      (isNx1 ? " (vertical dump)" : "") +
      ` expected ${expectRows}x${expectCols}`,
  );
  if (!ok) {
    console.log(
      "  matrix:",
      matrix.map((r) => r.map((c) => String(c).slice(0, 16))),
    );
  }
  return ok ? 0 : 1;
}

let failed = 0;

// Partial next agent row after 2 complete 5-col rows → drop stub, keep 2x5
failed += assertMatrix(
  "partial-next-row",
  [
    "AGENTA",
    "10",
    "$1.00",
    "$2.00",
    "$3.00",
    "AGENTB",
    "20",
    "$4.00",
    "$5.00",
    "$6.00",
    "AGENTC",
    "30",
    "$7.00",
  ].join("\n"),
  2,
  5,
);

// Multi-line DataTables paginator after one complete 9-col row
failed += assertMatrix(
  "multiline-paginator",
  [
    "SDSPDA95",
    "6522",
    "$0.00",
    "$1.00",
    "$2.00",
    "$3.00",
    "$4.00",
    "$0.00",
    "$5.00",
    "Showing",
    "1",
    "to",
    "10",
    "of",
    "50",
    "entries",
  ].join("\n"),
  1,
  9,
);

// Complete agent + Subtotal + truncated Total Amount → keep 2x9
failed += assertMatrix(
  "truncated-total-amount",
  [
    "SDSPDA95",
    "6522",
    "$0.00",
    "$11,110.75",
    "$11,110.75",
    "$9,825.31",
    "$11,110.75",
    "$0.00",
    "$1,285.44",
    "Subtotal",
    "6522",
    "$0.00",
    "$11,110.75",
    "$11,110.75",
    "$9,825.31",
    "$11,110.75",
    "$0.00",
    "$1,285.44",
    "Total Amount",
    "6522",
    "$0.00",
  ].join("\n"),
  2,
  9,
);

// Label-only trailing chrome (already expected green)
failed += assertMatrix(
  "label-only-trailing",
  [
    "AGENTA",
    "10",
    "$1.00",
    "$2.00",
    "$3.00",
    "Downline Login Id",
    "Total Turnover",
  ].join("\n"),
  1,
  5,
);

// Guard: intentional all-numeric vertical list stays Nx1
failed += assertMatrix(
  "numeric-column-guard",
  ["100", "200", "300", "$4.00", "5,000"].join("\n"),
  5,
  1,
  { allowVertical: true },
);

// Total row: preserve blank tabs between label and first number (web 1:1)
failed += assertMatrix(
  "total-row-label-gap",
  "Total\t\t135,873.00\t114,191.00\t11\t950",
  1,
  6,
  { firstNumCol: 2, firstNumValue: "135,873.00" },
);

// Screenshot: Total | empty | empty | 135,873.00 | … (two name-column gaps)
failed += assertMatrix(
  "total-row-double-empty-gap",
  "Total\t\t\t135,873.00\t114,191.00\t11\t950",
  1,
  7,
  { firstNumCol: 3, firstNumValue: "135,873.00" },
);

// Total row: drag-to-end trailing empty tab cells
failed += assertMatrix(
  "total-row-trailing-empty-tabs",
  "Total\t135,873.00\t114,191.00\t11\t\t\t",
  1,
  4,
);

// Sub Total keeps intentional name-column gap (2.Format style)
const subTotalMatrix = parsePlainTextMatrix("Sub Total\t\t135,873.00\t114,191.00");
const subCols = subTotalMatrix[0]?.length || 0;
const subGapKept =
  subTotalMatrix.length === 1 &&
  subCols === 4 &&
  subTotalMatrix[0][0] === "Sub Total" &&
  subTotalMatrix[0][1] === "" &&
  subTotalMatrix[0][2] === "135,873.00";
console.log(
  `${subGapKept ? "PASS" : "FAIL"} sub-total-gap-preserved: got ${subTotalMatrix.length}x${subCols}`,
);
if (!subGapKept) {
  failed += 1;
  console.log("  matrix:", subTotalMatrix);
}

// Format-style cell matrix: Total label gap + trailing empty cols (text+format path)
const formatTotalRow = sanitizePasteMatrix([
  [
    { value: "Total", styleCssText: "background:#ff0" },
    { value: "" },
    { value: "135,873.00" },
    { value: "114,191.00" },
    { value: "" },
    { value: "" },
  ],
]);
const formatOk =
  formatTotalRow.length === 1 &&
  formatTotalRow[0].length === 4 &&
  formatTotalRow[0][0].value === "Total" &&
  formatTotalRow[0][1].value === "" &&
  formatTotalRow[0][2].value === "135,873.00" &&
  formatTotalRow[0][3].value === "114,191.00";
console.log(
  `${formatOk ? "PASS" : "FAIL"} format-total-row-sanitize: cols=${formatTotalRow[0]?.length}`,
);
if (!formatOk) {
  failed += 1;
  console.log(
    "  row:",
    formatTotalRow[0]?.map((c) => c.value),
  );
}

// 2.Format over-select: Total row + paginator row + trailing empty cols
const formatOverselect = sanitizePasteMatrix([
  [
    { value: "Total" },
    { value: "" },
    { value: "135,873.00" },
    { value: "114,191.00" },
    { value: "" },
    { value: "" },
  ],
  [{ value: "Showing" }, { value: "1" }, { value: "to" }, { value: "10" }],
]);
const formatOverOk =
  formatOverselect.length === 1 &&
  formatOverselect[0][1]?.value === "" &&
  formatOverselect[0][2]?.value === "135,873.00";
console.log(
  `${formatOverOk ? "PASS" : "FAIL"} format-overselect-paginator: rows=${formatOverselect.length}`,
);
if (!formatOverOk) {
  failed += 1;
  console.log(
    "  matrix:",
    formatOverselect.map((r) => r.map((c) => c.value)),
  );
}

const { plainMatrixLooksReliable, matrixAlignsWithPlainSource } = await import(
  pathToFileURL(path.join(base, "dataCapturePasteMatrixSanitize.js")).href,
);

const plainTruth = parsePlainTextMatrix("Total\t\t135,873.00\t114,191.00");
const htmlMisaligned = [
  [{ value: "Total" }, { value: "135,873.00" }, { value: "114,191.00" }],
];
const htmlAligned = [
  [{ value: "Total" }, { value: "" }, { value: "135,873.00" }, { value: "114,191.00" }],
];
const alignReject =
  plainMatrixLooksReliable(plainTruth) &&
  !matrixAlignsWithPlainSource(htmlMisaligned, plainTruth);
const alignAccept = matrixAlignsWithPlainSource(
  sanitizePasteMatrix(htmlAligned),
  plainTruth,
);
console.log(
  `${alignReject && alignAccept ? "PASS" : "FAIL"} plain-html-cross-check`,
);
if (!(alignReject && alignAccept)) {
  failed += 1;
  console.log("  rejectMisaligned=", alignReject, "acceptSanitized=", alignAccept);
}

if (failed) {
  console.error(`\n${failed} over-select fixture(s) failed`);
  process.exit(1);
}
console.log("\nAll over-select paste fixtures green");
