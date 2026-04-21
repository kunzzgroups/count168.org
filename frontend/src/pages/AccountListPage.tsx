import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatApiError } from '@/lib/formatApiError'
import {
  createAccount,
  getAccounts,
  softDeleteAccount,
  type AccountItem,
} from '@/services/accountListService'

export default function AccountListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<AccountItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState({
    account_id: '',
    name: '',
    role: 'user',
  })

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAccounts(search.trim(), showInactive)
      setItems(data)
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchList()
  }, [showInactive])

  const onSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await fetchList()
  }

  const onCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!form.account_id.trim() || !form.name.trim()) {
      setError(t('accountList.validation.required'))
      return
    }
    setSubmitting(true)
    try {
      await createAccount({
        account_id: form.account_id.trim().toUpperCase(),
        name: form.name.trim(),
        role: form.role.trim().toLowerCase() || 'user',
      })
      setForm({ account_id: '', name: '', role: 'user' })
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setSubmitting(false)
    }
  }

  const onSoftDelete = async (id: number) => {
    setError('')
    try {
      await softDeleteAccount(id)
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    }
  }

  return (
    <div className="min-h-dvh w-full max-w-[100vw] overflow-x-hidden bg-zinc-50 px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              {t('accountList.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('accountList.subtitle')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            {t('accountList.back')}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountList.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="account-id">{t('accountList.fields.accountId')}</Label>
                <Input
                  id="account-id"
                  value={form.account_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-name">{t('accountList.fields.name')}</Label>
                <Input
                  id="account-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-role">{t('accountList.fields.role')}</Label>
                <Input
                  id="account-role"
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('accountList.submitting') : t('accountList.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('accountList.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('accountList.searchPlaceholder')}
              />
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                {t('accountList.showInactive')}
              </label>
              <Button type="submit" variant="outline">
                {t('accountList.search')}
              </Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">{t('accountList.fields.accountId')}</th>
                    <th className="py-2 pr-3">{t('accountList.fields.name')}</th>
                    <th className="py-2 pr-3">{t('accountList.fields.role')}</th>
                    <th className="py-2 pr-3">{t('accountList.fields.status')}</th>
                    <th className="py-2 pr-3">{t('accountList.fields.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-3 pr-3">
                        {t('accountList.loading')}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 pr-3">
                        {t('accountList.empty')}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-3">{item.account_id}</td>
                        <td className="py-3 pr-3">{item.name}</td>
                        <td className="py-3 pr-3">{item.role || '-'}</td>
                        <td className="py-3 pr-3">{item.status}</td>
                        <td className="py-3 pr-3">
                          {item.status === 'active' ? (
                            <Button type="button" variant="outline" onClick={() => void onSoftDelete(item.id)}>
                              {t('accountList.delete')}
                            </Button>
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
