import type { TFunction } from 'i18next'
import axios from 'axios'

import { ApiRequestError } from '@/lib/apiError'

type ErrorBody = {
  error?: string
  error_code?: string
}

function translateCode(t: TFunction, code: string): string | null {
  const key = `apiErrors.${code}`
  const out = t(key)
  return out === key ? null : out
}

export function formatApiError(t: TFunction, err: unknown): string {
  if (err instanceof ApiRequestError && err.errorCode) {
    const tr = translateCode(t, err.errorCode)
    if (tr) {
      return tr
    }
  }

  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ErrorBody | undefined
    if (data?.error_code) {
      const tr = translateCode(t, data.error_code)
      if (tr) {
        return tr
      }
    }
    if (data?.error) {
      return data.error
    }
  }

  if (err instanceof Error && err.message) {
    return err.message
  }

  return t('common.requestFailed')
}
