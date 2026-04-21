import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type AccountItem = {
  id: number
  account_id: string
  name: string
  role: string
  status: string
}

export type CreateAccountPayload = {
  account_id: string
  name: string
  role: string
}

type ApiBody<T> = {
  success: boolean
  data?: T
  error?: string
  error_code?: string
}

function throwFromBody(body: ApiBody<unknown>): never {
  throw new ApiRequestError(body.error ?? '', body.error_code)
}

export async function getAccounts(search = '', showInactive = false): Promise<AccountItem[]> {
  try {
    const response = await api.get<ApiBody<AccountItem[]>>('/account_list.php', {
      params: { search, showInactive },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<AccountItem[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function createAccount(payload: CreateAccountPayload): Promise<number> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/account_list.php', payload)
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data.id
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<{ id: number }>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function softDeleteAccount(id: number): Promise<void> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/account_list.php', {
      action: 'soft_delete',
      id,
    })
    const body = response.data
    if (!body.success) {
      throwFromBody(body)
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<{ id: number }>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}
