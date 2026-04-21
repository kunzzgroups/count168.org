import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type MemberItem = {
  id: number
  account_id: string
  name: string
  status: string
}

export type CreateMemberPayload = {
  account_id: string
  name: string
  password: string
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

export async function getMembers(search = ''): Promise<MemberItem[]> {
  try {
    const response = await api.get<ApiBody<MemberItem[]>>('/member.php', {
      params: { search },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<MemberItem[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function createMember(payload: CreateMemberPayload): Promise<number> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/member.php', payload)
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

export async function softDeleteMember(id: number): Promise<void> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/member.php', {
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
