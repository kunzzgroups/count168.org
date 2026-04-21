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
  createProcess,
  getProcesses,
  softDeleteProcess,
  type ProcessItem,
} from '@/services/processListService'

export default function ProcessListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<ProcessItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState({ process_id: '', description_id: '', remark: '' })

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getProcesses(search.trim(), showInactive)
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
    if (!form.process_id.trim() || !form.description_id.trim()) {
      setError(t('processList.validation.required'))
      return
    }
    setSubmitting(true)
    try {
      await createProcess({
        process_id: form.process_id.trim().toUpperCase(),
        description_id: form.description_id.trim(),
        remark: form.remark.trim(),
      })
      setForm({ process_id: '', description_id: '', remark: '' })
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
      await softDeleteProcess(id)
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
              {t('processList.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('processList.subtitle')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            {t('processList.back')}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('processList.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="process-id">{t('processList.fields.processId')}</Label>
                <Input
                  id="process-id"
                  value={form.process_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, process_id: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description-id">{t('processList.fields.descriptionId')}</Label>
                <Input
                  id="description-id"
                  value={form.description_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, description_id: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="process-remark">{t('processList.fields.remark')}</Label>
                <Input
                  id="process-remark"
                  value={form.remark}
                  onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('processList.submitting') : t('processList.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('processList.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('processList.searchPlaceholder')}
              />
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                {t('processList.showInactive')}
              </label>
              <Button type="submit" variant="outline">
                {t('processList.search')}
              </Button>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">{t('processList.fields.processId')}</th>
                    <th className="py-2 pr-3">{t('processList.fields.descriptionId')}</th>
                    <th className="py-2 pr-3">{t('processList.fields.remark')}</th>
                    <th className="py-2 pr-3">{t('processList.fields.status')}</th>
                    <th className="py-2 pr-3">{t('processList.fields.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="py-3 pr-3">{t('processList.loading')}</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={5} className="py-3 pr-3">{t('processList.empty')}</td></tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-3">{item.process_id}</td>
                        <td className="py-3 pr-3">{item.description_id}</td>
                        <td className="py-3 pr-3">{item.remark || '-'}</td>
                        <td className="py-3 pr-3">{item.status}</td>
                        <td className="py-3 pr-3">
                          {item.status === 'active' ? (
                            <Button type="button" variant="outline" onClick={() => void onSoftDelete(item.id)}>
                              {t('processList.delete')}
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
