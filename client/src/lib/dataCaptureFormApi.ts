import { apiFetch } from './api'

/** 与 `js/datacapture.js` 中 `get_processes_by_day` 返回行一致（仅列前端用到的字段） */
export type DataCaptureProcessDayRow = {
  id: string | number
  process_id: string
  description_name?: string | null
  process_display?: string | null
}

export type ProcessesByDayApiResult = {
  success: boolean
  error?: string
  data?: DataCaptureProcessDayRow[]
  day_of_week?: string
}

/** 与 `generateDateOptions` 一致：今日 ±6 天，共 13 天，YYYY-MM-DD */
export function buildDataCaptureDateChoices(): { value: string; label: string }[] {
  const today = new Date()
  const weekdayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]
  const out: { value: string; label: string }[] = []
  for (let i = 6; i >= -6; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const value = `${year}-${month}-${day}`
    const weekday = weekdayNames[date.getDay()]
    out.push({ value, label: `${value} (${weekday})` })
  }
  return out
}

export function defaultDataCaptureDateValue(choices: { value: string }[]): string {
  const t = new Date()
  const y = t.getFullYear()
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const d = String(t.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}`
  if (choices.some((c) => c.value === today)) return today
  return choices[6]?.value ?? today
}

export async function fetchDataCaptureProcessesByDay(
  companyId: number | null,
  date: string,
): Promise<ProcessesByDayApiResult> {
  const action = `action=get_processes_by_day&date=${encodeURIComponent(date)}`
  const path =
    companyId != null
      ? `/api/processes/submitted_processes_api.php?${action}&company_id=${encodeURIComponent(String(companyId))}`
      : `/api/processes/submitted_processes_api.php?${action}`
  const res = await apiFetch(path)
  return (await res.json()) as ProcessesByDayApiResult
}
