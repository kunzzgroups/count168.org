import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type UserAccessItem = {
  id: number
  login_id: string
  name: string
  role: string
  permissions: string[]
  account_permissions: any[]
  process_permissions: any[]
}

export type CopyPermissionsPayload = {
  affected_user_ids: number[]
  permissions: string[]
  account_permissions: any[]
  process_permissions: any[]
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

export async function getAllUsersAccess(): Promise<UserAccessItem[]> {
  try {
    const response = await api.get<ApiBody<UserAccessItem[]>>('/user_access.php', {
      params: { action: 'get_all_users' },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<UserAccessItem[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function copyPermissions(payload: CopyPermissionsPayload): Promise<{ success_count: number; total_count: number }> {
  try {
    const response = await api.post<ApiBody<{ success_count: number; total_count: number }>>('/user_access.php', {
      action: 'copy_permissions',
      ...payload,
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<{ success_count: number; total_count: number }>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}
