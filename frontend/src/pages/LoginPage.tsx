import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/authStorage'
import { formatApiError } from '@/lib/formatApiError'
import { login } from '@/services/authService'

export default function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (localStorage.getItem(AUTH_TOKEN_KEY)) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    const u = username.trim()
    const p = password.trim()
    if (!u || !p) {
      setError(t('validation.loginRequired'))
      return
    }

    setLoading(true)
    try {
      const result = await login(u, p)
      localStorage.setItem(AUTH_TOKEN_KEY, result.token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh w-full max-w-[100vw] items-center justify-center bg-zinc-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>{t('auth.loginTitle')}</CardTitle>
              <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-zinc-500">{t('common.language')}</span>
              <div className="flex rounded-md border border-zinc-200 bg-white p-0.5 text-xs">
                <Button
                  type="button"
                  variant={i18n.language === 'zh' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void i18n.changeLanguage('zh')}
                >
                  {t('common.locale.zh')}
                </Button>
                <Button
                  type="button"
                  variant={i18n.language === 'en' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void i18n.changeLanguage('en')}
                >
                  {t('common.locale.en')}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={loading}
              />
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('auth.submitting') : t('auth.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
