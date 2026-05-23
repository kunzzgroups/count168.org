/**
 * Column/row header chrome — SPA uses table delegation; only cursor + renumber here.
 */
import { getRowLabel } from "./dataCaptureGridMeta.js";

export function attachColumnHeaderListeners(header) {
  if (!header) return;
  header.style.cursor = "pointer";
}

export function attachRowHeaderListeners(rowHeader) {
  if (!rowHeader) return;
  rowHeader.style.cursor = "pointer";
}

export function refreshColumnHeaderNumbers(headerRow) {
  if (!headerRow) return;
  Array.from(headerRow.querySelectorAll("th")).forEach((header, index) => {
    if (index > 0) header.textContent = String(index);
  });
}

export function rebindColumnHeadersAfterMutation(headerRow) {
  refreshColumnHeaderNumbers(headerRow);
}

export function rebindRowHeadersAfterMutation(tableBody) {
  if (!tableBody) return;
  Array.from(tableBody.children).forEach((row, index) => {
    const rh = row.querySelector(".row-header");
    if (rh) rh.textContent = getRowLabel(index);
  });
}
