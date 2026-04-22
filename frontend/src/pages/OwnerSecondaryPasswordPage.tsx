import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function OwnerSecondaryPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('')
    if (!/^\d{6}$/.test(password)) { setError('Password must be exactly 6 digits'); return }
    setSuccess(true)
  }

  return (
    <ModuleSidebarLayout><div className="mx-auto w-full max-w-md space-y-6 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Secondary Password Verification</h1>
        <p className="text-sm text-zinc-500 mt-2">Enter your 6-digit secondary password to continue</p>
      </header>
      {success ? (
        <Card className="border-green-200 bg-green-50"><CardContent className="py-6 text-center">
          <p className="text-green-700 font-medium mb-4">✓ Verification successful</p>
          <Button onClick={()=>navigate('/dashboard')}>Continue to Dashboard</Button>
        </CardContent></Card>
      ) : (
        <Card><CardHeader><CardTitle>Enter Password</CardTitle></CardHeader><CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="sec-pw">Secondary Password</Label>
              <Input id="sec-pw" type="password" maxLength={6} pattern="[0-9]{6}" value={password}
                onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,'').slice(0,6);setPassword(v)}}
                placeholder="Enter 6-digit password" autoFocus />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">Verify</Button>
          </form>
        </CardContent></Card>
      )}
      <div className="text-center"><Button variant="ghost" size="sm" onClick={()=>navigate('/modules')}>Back to Modules</Button></div>
    </div></ModuleSidebarLayout>
  )
}
