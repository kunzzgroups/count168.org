import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type AnnouncementItem = {
  id: number
  title: string
  content: string
  status: string
  created_at: string
  created_by: string
}

export type CreateAnnouncementPayload = {
  title: string
  content: string
}

export type UpdateAnnouncementPayload = {
  id: number
  title: string
  content: string
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

export async function getAnnouncements(search = ''): Promise<AnnouncementItem[]> {
  try {
    const response = await api.get<ApiBody<AnnouncementItem[]>>('/announcements.php', {
      params: { search },
    })
    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<ApiBody<AnnouncementItem[]>>
      const d = ax.response?.data
      if (d && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}

export async function createAnnouncement(payload: CreateAnnouncementPayload): Promise<number> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/announcements.php', {
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

export async function updateAnnouncement(payload: UpdateAnnouncementPayload): Promise<void> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/announcements.php', {
      action: 'update',
      ...payload,
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

export async function deleteAnnouncement(id: number): Promise<void> {
  try {
    const response = await api.post<ApiBody<{ id: number }>>('/announcements.php', {
      action: 'delete',
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
