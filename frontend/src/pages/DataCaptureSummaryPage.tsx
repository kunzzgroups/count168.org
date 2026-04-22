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

type Row = { id: number; capture_date: string; process_id: string; description: string; status: string; created_at: string }
const today = () => new Date().toISOString().slice(0,10)
const fom = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

export default function DataCaptureSummaryPage() {
  const { t } = useTranslation(); const navigate = useNavigate()
  const [items, setItems] = useState<Row[]>([]); const [loading, setLoading] = useState(false)
  const [error, setError] = useState(''); const [dateFrom, setDateFrom] = useState(fom())
  const [dateTo, setDateTo] = useState(today()); const [fetched, setFetched] = useState(false)

  const doFetch = async () => { setLoading(true); setError(''); try {
    const r = await api.get<{success:boolean;data:Row[]}>('/capture_maintenance.php',{params:{date_from:dateFrom,date_to:dateTo}})
    if(r.data.success) setItems(r.data.data??[]); setFetched(true)
  } catch(e){setError(formatApiError(t,e))} finally{setLoading(false)} }
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); await doFetch() }

  return (
    <ModuleSidebarLayout><div className="mx-auto w-full max-w-6xl space-y-6 py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>
        <h1 className="text-[clamp(2rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">Data Capture Summary</h1>
        <p className="text-[clamp(1.2rem,0.15vw+1rem,1.3rem)] text-zinc-500">Summarized view of data capture records</p>
      </div><Button type="button" variant="outline" onClick={()=>navigate('/modules')}>Back to Modules</Button></header>
      <Card><CardHeader><CardTitle>Date Range</CardTitle></CardHeader><CardContent>
        <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
          <div className="space-y-2"><Label>From</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>To</Label><Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
          <Button type="submit" disabled={loading}>{loading?'Loading...':'Generate Summary'}</Button>
        </form>
      </CardContent></Card>
      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{error}</CardContent></Card>}
      {fetched && <Card><CardHeader><CardTitle>Summary ({items.length} captures)</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[500px] border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-200 text-zinc-600">
          <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Process</th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Created</th>
        </tr></thead><tbody>
          {items.length===0?<tr><td colSpan={5} className="py-4 text-center text-zinc-500">No captures in this period.</td></tr>:
            items.map(r=><tr key={r.id} className="border-b border-zinc-100"><td className="py-2 pr-3">{r.capture_date}</td><td className="py-2 pr-3 font-medium">{r.process_id||'-'}</td><td className="py-2 pr-3">{r.description||'-'}</td><td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status==='active'||r.status==='completed'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}`}>{r.status||'-'}</span></td><td className="py-2 pr-3 text-xs">{r.created_at}</td></tr>)}
        </tbody></table></div>
      </CardContent></Card>}
    </div></ModuleSidebarLayout>
  )
}
