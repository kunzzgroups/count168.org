import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type DashboardSummary = {
  balance: number
  month_income: number
  month_expense: number
}

type DashboardSummaryResponse = {
  success: boolean
  data?: DashboardSummary
  error?: string
  error_code?: string
}

function throwFromBody(body: DashboardSummaryResponse): never {
  throw new ApiRequestError(body.error ?? '', body.error_code)
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const response = await api.get<DashboardSummaryResponse>('/dashboard_summary.php')
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<DashboardSummaryResponse>
      const d = ax.response?.data
      if (d && typeof d === 'object' && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}
