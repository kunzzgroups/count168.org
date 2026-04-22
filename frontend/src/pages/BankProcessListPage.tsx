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
import api from '@/services/api'

type Row = { id: number; name: string; bank: string; process_id: string; status: string; profit: number; cost: number; card_merchant_code: string; card_merchant_name: string }

export default function BankProcessListPage() {
  const { t } = useTranslation(); const navigate = useNavigate()
  const [items, setItems] = useState<Row[]>([]); const [loading, setLoading] = useState(false)
  const [error, setError] = useState(''); const [search, setSearch] = useState('')
  const [fetched, setFetched] = useState(false)

  const fetch = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get<{ success: boolean; data: Row[] }>('/bank_process_list.php', { params: { search } })
      if (r.data.success) setItems(r.data.data ?? [])
      else setError('Failed to load')
      setFetched(true)
    } catch (e) { setError(formatApiError(t, e)) } finally { setLoading(false) }
  }

  const onSearch = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); await fetch() }

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">Bank Process List</h1>
            <p className="text-[clamp(1.2rem,0.15vw+1rem,1.3rem)] text-zinc-500">View and manage bank processes</p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>Back to Modules</Button>
        </header>
        <Card>
          <CardHeader><CardTitle>Search</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={onSearch}>
              <div className="space-y-2 flex-1"><Label htmlFor="bp-search">Keyword</Label><Input id="bp-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, bank, process..." /></div>
              <Button type="submit" disabled={loading}>{loading ? 'Loading...' : 'Search'}</Button>
            </form>
          </CardContent>
        </Card>
        {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{error}</CardContent></Card>}
        {fetched && (
          <Card><CardHeader><CardTitle>Results ({items.length})</CardTitle></CardHeader><CardContent>
            <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-200 text-zinc-600">
              <th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Bank</th><th className="py-2 pr-3">Process</th><th className="py-2 pr-3">Card Merchant</th><th className="py-2 pr-3">Status</th>
            </tr></thead><tbody>
              {items.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-zinc-500">No records found.</td></tr> :
                items.map(r => <tr key={r.id} className="border-b border-zinc-100"><td className="py-2 pr-3 font-medium">{r.name}</td><td className="py-2 pr-3">{r.bank}</td><td className="py-2 pr-3">{r.process_id}</td><td className="py-2 pr-3">{r.card_merchant_name || r.card_merchant_code || '-'}</td><td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status==='active'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}`}>{r.status}</span></td></tr>)}
            </tbody></table></div>
          </CardContent></Card>
        )}
      </div>
    </ModuleSidebarLayout>
  )
}
