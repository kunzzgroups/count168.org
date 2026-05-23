export const summaryQueryKeys = {
  root: () => ["summary"],
  session: () => [...summaryQueryKeys.root(), "session"],
  formCatalog: (companyId) => [...summaryQueryKeys.root(), "formCatalog", companyId ?? "none"],
  serverState: (companyId, processId, processCode) => [
    ...summaryQueryKeys.root(),
    "serverState",
    companyId ?? "none",
    processId ?? "none",
    processCode ?? "",
  ],
  templates: (captureId, companyId) => [
    ...summaryQueryKeys.root(),
    "templates",
    captureId ?? "none",
    companyId ?? "none",
  ],
};
