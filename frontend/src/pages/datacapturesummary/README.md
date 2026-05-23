# Data Capture Summary page (React + legacy)

Route: `/datacapturesummary` (see `App.jsx`). Entry: `DataCaptureSummaryPage.jsx`.

Upstream: `/datacapture` — capture session → `localStorage` → this page for review/submit.

## Where to change what

| Task | Location |
|------|----------|
| Page shell, legacy script boot, error boundary | `DataCaptureSummaryPage.jsx` |
| Session / company access (same rules as Data Capture) | `hooks/useSummaryBoot.js` → `datacapture/lib/dataCaptureCompanyAccess.js` |
| Capture session + server prefetch | `hooks/useSummaryCaptureBootstrap.js`, `lib/summaryStorage.js`, `lib/summaryTransform.js` |
| Summary rows state (React tbody) | `hooks/useSummaryRows.js`, `table/summaryRowModel.js` |
| Table populate + row/cell handlers | `hooks/useSummaryTablePopulate.js`, `table/summaryTablePostPopulate.js` |
| Column A reference data | `table/summaryColumnAData.js` |
| Sub-template grouping on refresh | `table/summarySubTemplatePopulate.js` |
| React/legacy table bridge flags | `hooks/useSummaryTableBridge.js` |
| Submit flow (validate → collect → API) | `hooks/useSummarySubmit.js`, `submit/summarySubmit*.js` |
| Batch limits / notification timing | `submit/summarySubmitConstants.js` |
| Delete selected rows | `lib/summaryDeleteFlow.js`, `hooks/useSummaryPageActions.js` |
| Back / restore capture navigation | `lib/summaryPageActions.js` |
| Edit Formula modal | `components/EditFormulaModal.jsx`, `hooks/useSummaryEditFormula.js` |
| Formula parse / eval / save | `formula/summaryFormula*.js`, `formula/editFormulaConstants.js` |
| Legacy formula shims on `window` | `formula/summaryFormulaEngineBridge.js` |
| Add account modal | `hooks/useSummaryAddAccount.js`, shared `AccountModal.jsx` |
| API calls | `lib/summaryApi.js` |
| Notifications | `lib/summaryNotify.js`, `hooks/useSummaryOverlays.js` |
| UI chrome | `components/Summary*.jsx` |

## Folder layout

```
datacapturesummary/
  DataCaptureSummaryPage.jsx
  README.md
  hooks/              # useSummary*.js — React orchestration
  components/         # Summary table shell, bars, modals
  lib/                # API, storage, notify, transform, page actions, delete
  submit/             # summarySubmit* — validation, DOM collect, payload, execution
  table/              # row model, column A, populate, DOM bridge, sub-templates
  formula/            # formula engine + editFormulaConstants (extracted from legacy)
```

## Legacy

- Runtime: `js/datacapturesummary.js` (loaded by `DataCaptureSummaryPage.jsx`).
- React modules register `window.__SUMMARY_*` shims; do not change `localStorage` keys in `lib/summaryStorage.js` without updating legacy.
- Regenerate extracted modules: `frontend/scripts/extract-summary-*.mjs` (paths point at `submit/` and `formula/`).

## Styles

- `frontend/public/css/datacapturesummary.css`, `account-list.css`, `accountCSS.css`, `userlist.css`, `global-13inch.css`
