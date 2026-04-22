import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type UserItem = {
  id: number
  login_id: string
  name: string
  email: string
  role: string
  status: string
}

export type CreateUserPayload = {
  login_id: string
  name: string
  email: string
  role: string
  password?: string
  status: string
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

export async function getUsers(search = ''): Promise<UserItem[]> {
  try {
    const response = await api.get<ApiBody<UserItem[]>>('/user_list.php', {
      params: { search },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<UserItem[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function createUser(payload: CreateUserPayload): Promise<number> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/user_list.php', {
      action: 'create',
      ...payload,
    })
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

export async function softDeleteUser(id: number): Promise<void> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/user_list.php', {
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
