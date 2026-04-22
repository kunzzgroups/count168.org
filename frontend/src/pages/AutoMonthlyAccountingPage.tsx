import { useNavigate } from 'react-router-dom'
import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AutoMonthlyAccountingPage() {
  const navigate = useNavigate()
  return (
    <ModuleSidebarLayout><div className="mx-auto w-full max-w-6xl space-y-6 py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>
        <h1 className="text-[clamp(2rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">Auto Monthly Accounting</h1>
        <p className="text-[clamp(1.2rem,0.15vw+1rem,1.3rem)] text-zinc-500">Automated monthly accounting job management</p>
      </div><Button type="button" variant="outline" onClick={()=>navigate('/modules')}>Back to Modules</Button></header>
      <Card><CardHeader><CardTitle>Monthly Accounting</CardTitle></CardHeader><CardContent>
        <p className="text-zinc-600 mb-4">This module handles automated monthly accounting processes. The system automatically generates accounting entries at the end of each billing cycle.</p>
        <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500">
          <p className="font-semibold text-zinc-700 mb-2">Module Features:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Automated process billing generation</li>
            <li>Monthly settlement calculations</li>
            <li>Batch transaction posting</li>
            <li>Accounting period management</li>
          </ul>
        </div>
      </CardContent></Card>
    </div></ModuleSidebarLayout>
  )
}
