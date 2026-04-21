import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/authStorage'
import type { AuthUser } from '@/services/authService'

export default function DashboardPage() {
  const navigate = useNavigate()

  const user = useMemo<AuthUser | null>(() => {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as AuthUser
    } catch {
      return null
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-zinc-50 px-4 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">仪表盘</h1>
            <p className="text-sm text-zinc-500">欢迎回来</p>
          </div>
          <Button type="button" variant="outline" onClick={handleLogout}>
            退出登录
          </Button>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>当前用户</CardTitle>
            <CardDescription>来自登录接口的会话信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-700">
            <p>
              <span className="font-medium text-zinc-900">用户名：</span>
              {user?.username ?? '—'}
            </p>
            <p>
              <span className="font-medium text-zinc-900">角色：</span>
              {user?.role ?? '—'}
            </p>
            <p>
              <span className="font-medium text-zinc-900">ID：</span>
              {user?.id ?? '—'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
