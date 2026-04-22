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

type Row = Record<string, string | number | null>
const today = () => new Date().toISOString().slice(0,10)
const fom = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }
const f2 = (n: number) => n?.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) ?? '0.00'

function MaintenancePage({ title, subtitle, apiPath, columns }: { title: string; subtitle: string; apiPath: string; columns: { key: string; label: string; align?: string; fmt?: (v: unknown) => string }[] }) {
  const { t } = useTranslation(); const navigate = useNavigate()
  const [items, setItems] = useState<Row[]>([]); const [loading, setLoading] = useState(false)
  const [error, setError] = useState(''); const [dateFrom, setDateFrom] = useState(fom())
  const [dateTo, setDateTo] = useState(today()); const [search, setSearch] = useState(''); const [fetched, setFetched] = useState(false)

  const doFetch = async () => { setLoading(true); setError(''); try {
    const r = await api.get<{success:boolean;data:Row[]}>(`/${apiPath}`,{params:{date_from:dateFrom,date_to:dateTo,search}})
    if(r.data.success) setItems(r.data.data??[]); setFetched(true)
  } catch(e){setError(formatApiError(t,e))} finally{setLoading(false)} }
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); await doFetch() }

  return (
    <ModuleSidebarLayout><div className="mx-auto w-full max-w-6xl space-y-6 py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>
        <h1 className="text-[clamp(2rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">{title}</h1>
        <p className="text-[clamp(1.2rem,0.15vw+1rem,1.3rem)] text-zinc-500">{subtitle}</p>
      </div><Button type="button" variant="outline" onClick={()=>navigate('/modules')}>Back to Modules</Button></header>
      <Card><CardHeader><CardTitle>Filters</CardTitle></CardHeader><CardContent>
        <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
          <div className="space-y-2"><Label>From</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>To</Label><Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
          <div className="space-y-2 flex-1"><Label>Search</Label><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Keyword..." /></div>
          <Button type="submit" disabled={loading}>{loading?'Loading...':'Search'}</Button>
        </form>
      </CardContent></Card>
      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{error}</CardContent></Card>}
      {fetched && <Card><CardHeader><CardTitle>Results ({items.length})</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-200 text-zinc-600">
          {columns.map(c=><th key={c.key} className={`py-2 pr-3 ${c.align==='right'?'text-right':''}`}>{c.label}</th>)}
        </tr></thead><tbody>
          {items.length===0?<tr><td colSpan={columns.length} className="py-4 text-center text-zinc-500">No records.</td></tr>:
            items.map((r,i)=><tr key={i} className="border-b border-zinc-100">
              {columns.map(c=><td key={c.key} className={`py-2 pr-3 ${c.align==='right'?'text-right':''}`}>{c.fmt?c.fmt(r[c.key]):String(r[c.key]??'-')}</td>)}
            </tr>)}
        </tbody></table></div>
      </CardContent></Card>}
    </div></ModuleSidebarLayout>
  )
}

export function TransactionMaintenancePage() {
  return <MaintenancePage title="Transaction Maintenance" subtitle="Search and manage transaction records" apiPath="transaction_maintenance.php" columns={[
    {key:'transaction_date',label:'Date'},{key:'account_code',label:'Account'},{key:'transaction_type',label:'Type'},
    {key:'amount',label:'Amount',align:'right',fmt:v=>f2(Number(v))},{key:'description',label:'Description'},{key:'created_at',label:'Created'}
  ]} />
}
export function PaymentMaintenancePage() {
  return <MaintenancePage title="Payment Maintenance" subtitle="Search payment, receive, contra and claim records" apiPath="payment_maintenance.php" columns={[
    {key:'transaction_date',label:'Date'},{key:'account_code',label:'Account'},{key:'from_account_code',label:'From'},
    {key:'transaction_type',label:'Type'},{key:'amount',label:'Amount',align:'right',fmt:v=>f2(Number(v))},{key:'description',label:'Description'}
  ]} />
}
export function BankprocessMaintenancePage() {
  return <MaintenancePage title="Bank Process Maintenance" subtitle="View bank process transaction records" apiPath="bankprocess_maintenance.php" columns={[
    {key:'transaction_date',label:'Date'},{key:'account_code',label:'Account'},{key:'bank_process_name',label:'Bank Process'},
    {key:'transaction_type',label:'Type'},{key:'amount',label:'Amount',align:'right',fmt:v=>f2(Number(v))},{key:'description',label:'Description'}
  ]} />
}
export function CaptureMaintenancePage() {
  return <MaintenancePage title="Capture Maintenance" subtitle="View data capture records by date range" apiPath="capture_maintenance.php" columns={[
    {key:'capture_date',label:'Date'},{key:'process_id',label:'Process'},{key:'description',label:'Description'},
    {key:'status',label:'Status'},{key:'created_at',label:'Created'}
  ]} />
}
