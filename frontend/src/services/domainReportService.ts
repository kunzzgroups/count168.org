import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type DomainReportRow = {
  process_id: number
  process: string
  description: string | null
  turnover: number
  win: number
  lose: number
  win_lose: number
}

export type ProcessOption = {
  id: number
  process: string
  description: string | null
  display_text: string
}

type ApiBody<T> = {
  success: boolean
  data?: T
  error?: string
  error_code?: string
}

type ReportResponse = ApiBody<DomainReportRow[]> & {
  totals?: { turnover: number; win: number; lose: number; win_lose: number }
}

export type DomainReportResult = {
  rows: DomainReportRow[]
  totals: { turnover: number; win: number; lose: number; win_lose: number }
}

export async function getProcesses(): Promise<ProcessOption[]> {
  try {
    const response = await api.get<ApiBody<ProcessOption[]>>('/domain_report.php', {
      params: { action: 'processes' },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throw new ApiRequestError(body.error ?? '', body.error_code)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<ProcessOption[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function getDomainReport(params: {
  date_from: string
  date_to: string
  process_id?: number
}): Promise<DomainReportResult> {
  try {
    const response = await api.get<ReportResponse>('/domain_report.php', { params })
    const body = response.data
    if (!body.success || !body.data) {
      throw new ApiRequestError(body.error ?? '', body.error_code)
    }
    return {
      rows: body.data,
      totals: body.totals ?? { turnover: 0, win: 0, lose: 0, win_lose: 0 },
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ReportResponse>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}
