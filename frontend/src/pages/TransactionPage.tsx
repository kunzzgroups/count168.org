import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatApiError } from '@/lib/formatApiError'
import {
  createTransaction,
  getTransactions,
  softDeleteTransaction,
  type TransactionFormPayload,
  type TransactionItem,
} from '@/services/transactionService'

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function createDefaultForm(): TransactionFormPayload {
  return {
    date: todayYmd(),
    type: 'expense',
    category: '',
    amount: 0,
    remark: '',
  }
}

export default function TransactionPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<TransactionItem[]>([])
  const [form, setForm] = useState<TransactionFormPayload>(createDefaultForm)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const totalBalance = useMemo(
    () =>
      items.reduce((sum, item) => {
        return item.type === 'income' ? sum + item.amount : sum - item.amount
      }, 0),
    [items],
  )

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getTransactions()
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const amountFloat = Number.parseFloat(String(form.amount))
    if (Number.isNaN(amountFloat) || amountFloat <= 0) {
      setError(t('transaction.validation.amount'))
      return
    }
    if (form.category.trim() === '') {
      setError(t('transaction.validation.category'))
      return
    }

    setSubmitting(true)
    try {
      await createTransaction({
        ...form,
        amount: amountFloat,
        category: form.category.trim(),
        remark: form.remark.trim(),
      })
      setForm(createDefaultForm())
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
      await softDeleteTransaction(id)
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
              {t('transaction.title')}
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              {t('transaction.subtitle')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            {t('transaction.back')}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('transaction.formTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="date">{t('transaction.fields.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{t('transaction.fields.type')}</Label>
                <select
                  id="type"
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, type: e.target.value as 'income' | 'expense' }))
                  }
                  disabled={submitting}
                >
                  <option value="income">{t('transaction.type.income')}</option>
                  <option value="expense">{t('transaction.type.expense')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('transaction.fields.category')}</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">{t('transaction.fields.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount === 0 ? '' : form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: e.target.value === '' ? 0 : Number(e.target.value),
                    }))
                  }
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="remark">{t('transaction.fields.remark')}</Label>
                <Input
                  id="remark"
                  value={form.remark}
                  onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('transaction.submitting') : t('transaction.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('transaction.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-600">
              {t('transaction.balance')}: <span className="font-semibold">{totalBalance.toFixed(2)}</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">{t('transaction.fields.date')}</th>
                    <th className="py-2 pr-3">{t('transaction.fields.type')}</th>
                    <th className="py-2 pr-3">{t('transaction.fields.category')}</th>
                    <th className="py-2 pr-3 text-right">{t('transaction.fields.amount')}</th>
                    <th className="py-2 pr-3">{t('transaction.fields.remark')}</th>
                    <th className="py-2 pr-3">{t('transaction.fields.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="py-3 pr-3" colSpan={6}>
                        {t('transaction.loading')}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td className="py-3 pr-3" colSpan={6}>
                        {t('transaction.empty')}
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-3">{item.date}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={
                              item.type === 'income'
                                ? 'rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700'
                                : 'rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700'
                            }
                          >
                            {item.type === 'income'
                              ? t('transaction.type.income')
                              : t('transaction.type.expense')}
                          </span>
                        </td>
                        <td className="py-3 pr-3">{item.category}</td>
                        <td className="py-3 pr-3 text-right font-medium">{item.amount.toFixed(2)}</td>
                        <td className="py-3 pr-3">{item.remark || '-'}</td>
                        <td className="py-3 pr-3">
                          <Button type="button" variant="outline" onClick={() => void onSoftDelete(item.id)}>
                            {t('transaction.delete')}
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
