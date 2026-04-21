import axios from 'axios'
import type { AxiosError } from 'axios'

import { ApiRequestError } from '@/lib/apiError'
import api from '@/services/api'

export type AuthUser = {
  id: number
  username: string
  role: string
}

export type LoginResult = {
  user: AuthUser
  token: string
}

type LoginResponseBody = {
  success: boolean
  data?: LoginResult
  error?: string
  error_code?: string
}

function throwFromBody(body: LoginResponseBody): never {
  throw new ApiRequestError(body.error ?? '', body.error_code)
}

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await api.post<LoginResponseBody>('/login.php', {
      username,
      password,
    })

    const body = response.data
    if (!body.success || !body.data) {
      throwFromBody(body)
    }
    return body.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<LoginResponseBody>
      const d = ax.response?.data
      if (d && typeof d === 'object' && d.success === false) {
        throw new ApiRequestError(d.error ?? '', d.error_code)
      }
    }
    throw err
  }
}
