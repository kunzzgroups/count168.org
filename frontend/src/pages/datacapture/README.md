# Data Capture page (React)

Route: `/datacapture` (see `App.jsx`). Entry: `DataCapturePage.jsx`.

Related: `/datacapturesummary` — `pages/datacapturesummary/` (see `datacapturesummary/README.md`).

## Where to change what

| Task | Location |
|------|----------|
| Page shell, company filter, script boot, page-ready chrome | `DataCapturePage.jsx` |
| Form fields, capture type, submit/reset | `hooks/useDataCaptureFormEngine.js`, `hooks/useDataCaptureCaptureType.js`, `hooks/useDataCaptureSubmitReset.js` |
| Category / permission gates | `hooks/useDataCaptureCategoryPermissions.js` |
| Submitted process list (right panel) | `hooks/useDataCaptureSubmittedList.js` |
| SPA init + legacy globals + notifications | `hooks/useDataCaptureGlobalShims.js`, `lib/dataCaptureSpaInit.js` |
| Table section JSX | `components/DataCaptureTableSection.jsx` |
| Editable grid JSX | `components/DataCaptureGrid.jsx` |
| Grid state & hooks | `hooks/useDataCaptureGrid.js`, `hooks/useDataCaptureGridInteraction.js`, `hooks/useDataCaptureGridHeader.js` |
| Grid constants, row labels, active flag | `grid/dataCaptureGridMeta.js` |
| Grid DOM / keyboard / selection | `grid/dataCaptureGrid*.js` (other grid modules) |
| Build empty grid, row/column CRUD | `grid/dataCaptureBuildGrid.js`, `grid/dataCaptureGridRowColumnCrud.js` |
| Format display & format-mode paste | `hooks/useDataCaptureFormatDisplay.js`, `hooks/useDataCaptureFormatPaste.js`, `format/dataCaptureFormat.js` |
| Cell paste (orchestration + typed router) | `hooks/useDataCapturePaste.js` → `paste/core/dataCapturePasteHandler.js` |
| Typed capture paste (VPOWER, WBET, …) | `paste/core/dataCapturePasteHandler.js` (`TYPED_CAPTURE_TYPES`) + `paste/vendors/*` |
| Citibet auto-detect / parsers | `paste/core/dataCapturePasteDetect.js`, `paste/vendors/dataCaptureCitibet*.js` |
| Generic / HTML / text paste | `paste/core/dataCaptureGenericPaste.js`, `paste/core/dataCaptureText*.js` |
| Clipboard + HTML table helpers | `paste/core/dataCaptureClipboard.js` |
| Apply matrix to grid | `paste/core/dataCapturePasteApply.js` |
| API, storage | `lib/dataCaptureApi.js`, `lib/dataCaptureStorage.js` |
| Form validation, capture types, descriptions | `lib/dataCaptureFormRules.js` |
| Company session / games access | `lib/dataCaptureCompanyAccess.js` |
| Context menus, delete dialog, modals | `components/DataCaptureContextMenus.jsx`, `components/DataCaptureDeleteDialog.jsx`, `components/DescriptionSelectionModal.jsx` |
| Notifications | `components/ProcessNotificationContainer.jsx`, `lib/dataCaptureNotify.js` |
| Submit table conversion | `lib/dataCaptureConvertTableOnSubmit.js`, `lib/dataCaptureTableSnapshot.js` |

## Folder layout

```
datacapture/
  DataCapturePage.jsx
  hooks/                       # 12 useDataCapture*.js
  components/
  grid/
    dataCaptureGridMeta.js     # DEFAULT_GRID_*, getRowLabel, tableActive
    dataCaptureGrid*.js        # interaction modules
  format/
    dataCaptureFormat.js       # preview storage + display toggles
  lib/
  paste/
    core/
    vendors/
```

**Add a new capture-type paste handler:** add `paste/vendors/dataCaptureXxxPaste.js`, then register in `paste/core/dataCapturePasteHandler.js` (`TYPED_CAPTURE_TYPES` + `handleTypedCapturePaste` switch).

## External imports

- `datacapturesummary/hooks/useSummaryBoot.js` → `datacapture/lib/dataCaptureCompanyAccess.js`

## Styles & legacy

- CSS: `frontend/public/css/datacapture.css`, `userlist.css`, `global-13inch.css`
- Legacy reference: `js/datacapture.js` (phased out; React owns paste via `window.__DC_*` shims)
