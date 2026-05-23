const MAX_HISTORY_SIZE = 50;

export const pasteHistory = [];

export function pushPasteHistory(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return;
  pasteHistory.push(changes);
  if (pasteHistory.length > MAX_HISTORY_SIZE) {
    pasteHistory.shift();
  }
}

export function clearPasteHistory() {
  pasteHistory.length = 0;
}

export function hasPasteHistory() {
  return pasteHistory.length > 0;
}

export function undoLastPaste() {
  if (pasteHistory.length === 0) {
    window.showNotification?.("No paste operation to undo", "danger");
    return;
  }

  const lastPaste = pasteHistory.pop();
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  let undoCount = 0;
  lastPaste.forEach((change) => {
    const row = tableBody.children[change.row];
    if (!row) return;
    const cell = row.children[change.col + 1];
    if (cell && cell.contentEditable === "true") {
      cell.textContent = change.oldValue;
      undoCount += 1;
    }
  });

  window.showNotification?.(`Undo completed: ${undoCount} cells restored`, "success");
}
