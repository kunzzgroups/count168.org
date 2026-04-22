import { useState } from 'react'
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
  getCustomerReport,
  type CustomerReportResult,
} from '@/services/customerReportService'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CustomerReportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo] = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<CustomerReportResult | null>(null)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!dateFrom || !dateTo) { setError('Please select date range'); return }
    setLoading(true)
    try {
      const data = await getCustomerReport({ date_from: dateFrom, date_to: dateTo, show_all: true })
      setReport(data)
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              Customer Report
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              View Win/Lose summary by account and currency
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            Back to Modules
          </Button>
        </header>

        <Card>
          <CardHeader><CardTitle>Report Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="cr-from">From</Label>
                <Input id="cr-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cr-to">To</Label>
                <Input id="cr-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? 'Loading...' : 'Generate Report'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        )}

        {report && (
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-600">
                      <th className="py-2 pr-3">Account ID</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Currency</th>
                      <th className="py-2 pr-3 text-right">Win</th>
                      <th className="py-2 pr-3 text-right">Lose</th>
                      <th className="py-2 pr-3 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-zinc-500">No data found for this period.</td></tr>
                    ) : (
                      report.rows.map((row, i) => (
                        <tr key={`${row.id}-${row.currency}-${i}`} className="border-b border-zinc-100">
                          <td className="py-2 pr-3 font-medium">{row.account_id}</td>
                          <td className="py-2 pr-3">{row.name}</td>
                          <td className="py-2 pr-3">{row.currency ?? '-'}</td>
                          <td className="py-2 pr-3 text-right text-green-700">{fmt(row.win)}</td>
                          <td className="py-2 pr-3 text-right text-red-700">{fmt(row.lose)}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{fmt(row.win + row.lose)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {report.rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 font-semibold">
                        <td colSpan={3} className="py-2 pr-3">Total</td>
                        <td className="py-2 pr-3 text-right text-green-700">{fmt(report.totalWin)}</td>
                        <td className="py-2 pr-3 text-right text-red-700">{fmt(report.totalLose)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(report.totalWin + report.totalLose)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ModuleSidebarLayout>
  )
}
