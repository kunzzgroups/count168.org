import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type CustomerReportRow = {
  id: number
  account_id: string
  name: string
  currency: string | null
  win: number
  lose: number
}

type ReportResponse = {
  success: boolean
  data?: CustomerReportRow[]
  total_win?: number
  total_lose?: number
  date_from?: string
  date_to?: string
  error?: string
  error_code?: string
}

export type CustomerReportResult = {
  rows: CustomerReportRow[]
  totalWin: number
  totalLose: number
}

export async function getCustomerReport(params: {
  date_from: string
  date_to: string
  account_id?: string
  show_all?: boolean
  currency?: string
}): Promise<CustomerReportResult> {
  try {
    const response = await api.get<ReportResponse>('/customer_report.php', { params })
    const body = response.data
    if (!body.success || !body.data) {
      throw new ApiRequestError(body.error ?? 'Unknown error', body.error_code)
    }
    return {
      rows: body.data,
      totalWin: body.total_win ?? 0,
      totalLose: body.total_lose ?? 0,
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
