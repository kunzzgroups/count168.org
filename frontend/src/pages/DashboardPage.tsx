import { useEffect, useMemo, useState } from 'react'
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
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/authStorage'
import { formatApiError } from '@/lib/formatApiError'
import type { AuthUser } from '@/services/authService'
import { getDashboardSummary } from '@/services/dashboardService'

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState({
    balance: 0,
    month_income: 0,
    month_expense: 0,
  })

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

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await getDashboardSummary()
        setSummary(data)
      } catch (err) {
        setError(formatApiError(t, err))
      } finally {
        setLoading(false)
      }
    }
    void loadSummary()
  }, [t])

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-zinc-50 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              {t('dashboard.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
              {t('dashboard.modules')}
            </Button>
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
            <Button type="button" variant="outline" onClick={handleLogout}>
              {t('dashboard.logout')}
            </Button>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-[clamp(1.6rem,0.3125vw+1.2rem,1.8rem)]">
                {t('dashboard.kpi.balanceTitle')}
              </CardTitle>
              <CardDescription>{t('dashboard.kpi.balanceDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[clamp(2.4rem,1.25vw+0.8rem,3.2rem)] font-semibold text-emerald-600">
                {loading ? '--.--' : formatMoney(summary.balance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-[clamp(1.6rem,0.3125vw+1.2rem,1.8rem)]">
                {t('dashboard.kpi.incomeTitle')}
              </CardTitle>
              <CardDescription>{t('dashboard.kpi.incomeDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-emerald-600">
                {loading ? '--.--' : formatMoney(summary.month_income)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-[clamp(1.6rem,0.3125vw+1.2rem,1.8rem)]">
                {t('dashboard.kpi.expenseTitle')}
              </CardTitle>
              <CardDescription>{t('dashboard.kpi.expenseDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-rose-600">
                {loading ? '--.--' : formatMoney(summary.month_expense)}
              </p>
            </CardContent>
          </Card>
        </div>
        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.currentUserTitle')}</CardTitle>
            <CardDescription>{t('dashboard.currentUserDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[clamp(1.4rem,0.3125vw+1.0rem,1.6rem)] text-zinc-700">
            <p>
              <span className="font-medium text-zinc-900">{t('dashboard.fields.username')}</span>
              {user?.username ?? '—'}
            </p>
            <p>
              <span className="font-medium text-zinc-900">{t('dashboard.fields.role')}</span>
              {user?.role ?? '—'}
            </p>
            <p>
              <span className="font-medium text-zinc-900">{t('dashboard.fields.id')}</span>
              {user?.id ?? '—'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
