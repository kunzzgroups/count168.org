import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatApiError } from '@/lib/formatApiError'
import api from '@/services/api'

type Row = { id: number; owner_code: string; name: string; email: string; status: string; created_at: string }

export default function OwnershipPage() {
  const { t } = useTranslation(); const navigate = useNavigate()
  const [items, setItems] = useState<Row[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('')

  useEffect(() => { void (async () => { setLoading(true); try {
    const r = await api.get<{success:boolean;data:Row[]}>('/ownership.php')
    if(r.data.success) setItems(r.data.data??[])
  } catch(e){setError(formatApiError(t,e))} finally{setLoading(false)} })() }, [])

  return (
    <ModuleSidebarLayout><div className="mx-auto w-full max-w-6xl space-y-6 py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>
        <h1 className="text-[clamp(2rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">Ownership</h1>
        <p className="text-[clamp(1.2rem,0.15vw+1rem,1.3rem)] text-zinc-500">View company owner information</p>
      </div><Button type="button" variant="outline" onClick={()=>navigate('/modules')}>Back to Modules</Button></header>
      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-4 text-sm text-red-700">{error}</CardContent></Card>}
      <Card><CardHeader><CardTitle>Owners</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[500px] border-collapse text-left text-sm"><thead><tr className="border-b border-zinc-200 text-zinc-600">
          <th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Created</th>
        </tr></thead><tbody>
          {loading?<tr><td colSpan={5} className="py-4 text-center text-zinc-500">Loading...</td></tr>:
           items.length===0?<tr><td colSpan={5} className="py-4 text-center text-zinc-500">No owners found.</td></tr>:
            items.map(r=><tr key={r.id} className="border-b border-zinc-100"><td className="py-2 pr-3 font-medium">{r.owner_code}</td><td className="py-2 pr-3">{r.name}</td><td className="py-2 pr-3">{r.email||'-'}</td><td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status==='active'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}`}>{r.status}</span></td><td className="py-2 pr-3 text-xs">{r.created_at}</td></tr>)}
        </tbody></table></div>
      </CardContent></Card>
    </div></ModuleSidebarLayout>
  )
}
