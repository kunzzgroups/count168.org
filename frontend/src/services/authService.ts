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

export async function login(username: string, password: string): Promise<LoginResult> {
  const response = await api.post<{
    success: boolean
    data?: LoginResult
    error?: string
  }>('/login.php', { username, password })

  const body = response.data
  if (!body.success || !body.data) {
    throw new Error(body.error ?? '登录失败')
  }
  return body.data
}
