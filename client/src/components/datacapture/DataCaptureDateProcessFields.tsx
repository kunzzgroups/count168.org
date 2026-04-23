import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildDataCaptureDateChoices,
  defaultDataCaptureDateValue,
  fetchDataCaptureProcessesByDay,
} from '../../lib/dataCaptureFormApi'

type Props = {
  companyId: number
  /** `runDataCapturePageInit` 完成后再拉工序，避免 `processDataMap` / DOM 未就绪 */
  legacyPageReady: boolean
}

/**
 * 日期选项 + 工序列表：用 React + apiFetch 请求，再通过 `datacaptureApplyProcessesApiResult`
 * 写入现有自定义 Process 下拉（与 `datacapture.js` 共用 DOM 约定）。
 */
export function DataCaptureDateProcessFields({ companyId, legacyPageReady }: Props) {
  const dateChoices = useMemo(() => buildDataCaptureDateChoices(), [])
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultDataCaptureDateValue(dateChoices),
  )

  const applyProcesses = useCallback(
    async (date: string) => {
      try {
        const result = await fetchDataCaptureProcessesByDay(companyId, date)
        window.datacaptureApplyProcessesApiResult?.(result, date)
      } catch (e) {
        console.error(e)
      }
    },
    [companyId],
  )

  useEffect(() => {
    if (!legacyPageReady) return
    void applyProcesses(selectedDate)
  }, [legacyPageReady, companyId, selectedDate, applyProcesses])

  return (
    <>
      <div className="form-group">
        <label htmlFor="capture_date">Date</label>
        <select
          id="capture_date"
          name="capture_date"
          required
          value={selectedDate}
          onChange={(e) => {
            const v = e.target.value
            setSelectedDate(v)
          }}
        >
          <option value="">Select Date</option>
          {dateChoices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="capture_process">Process</label>
        <div className="custom-select-wrapper">
          <button
            type="button"
            className="custom-select-button"
            id="capture_process"
            data-placeholder="Select Process"
            name="process"
          >
            Select Process
          </button>
          <div className="custom-select-dropdown" id="capture_process_dropdown">
            <div className="custom-select-search">
              <input type="text" placeholder="Search process..." autoComplete="off" />
            </div>
            <div className="custom-select-options" />
          </div>
        </div>
      </div>
    </>
  )
}
