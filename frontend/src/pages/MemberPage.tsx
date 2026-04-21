import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatApiError } from '@/lib/formatApiError'
import { createMember, getMembers, softDeleteMember, type MemberItem } from '@/services/memberService'

export default function MemberPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<MemberItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    account_id: '',
    name: '',
    password: '',
  })

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getMembers(search.trim())
      setItems(data)
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchList()
  }, [])

  const onSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await fetchList()
  }

  const onCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!form.account_id.trim() || !form.name.trim() || !form.password.trim()) {
      setError(t('member.validation.required'))
      return
    }
    setSubmitting(true)
    try {
      await createMember({
        account_id: form.account_id.trim().toUpperCase(),
        name: form.name.trim(),
        password: form.password,
      })
      setForm({ account_id: '', name: '', password: '' })
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
      await softDeleteMember(id)
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    }
  }

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              {t('member.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('member.subtitle')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            {t('member.back')}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('member.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="member-account-id">{t('member.fields.accountId')}</Label>
                <Input
                  id="member-account-id"
                  value={form.account_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-name">{t('member.fields.name')}</Label>
                <Input
                  id="member-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-password">{t('member.fields.password')}</Label>
                <Input
                  id="member-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('member.submitting') : t('member.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('member.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-3" onSubmit={onSearch}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('member.searchPlaceholder')}
              />
              <Button type="submit" variant="outline">
                {t('member.search')}
              </Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">{t('member.fields.accountId')}</th>
                    <th className="py-2 pr-3">{t('member.fields.name')}</th>
                    <th className="py-2 pr-3">{t('member.fields.status')}</th>
                    <th className="py-2 pr-3">{t('member.fields.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-3 pr-3">
                        {t('member.loading')}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 pr-3">
                        {t('member.empty')}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-3">{item.account_id}</td>
                        <td className="py-3 pr-3">{item.name}</td>
                        <td className="py-3 pr-3">{item.status}</td>
                        <td className="py-3 pr-3">
                          <Button type="button" variant="outline" onClick={() => void onSoftDelete(item.id)}>
                            {t('member.delete')}
                          </Button>
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
    </ModuleSidebarLayout>
  )
}
