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
import {
  createUser,
  getUsers,
  softDeleteUser,
  type UserItem,
} from '@/services/userListService'

export default function UserListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    login_id: '',
    name: '',
    email: '',
    role: 'manager',
    password: '',
    status: 'active',
  })

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getUsers(search.trim())
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
    if (!form.login_id.trim() || !form.name.trim() || !form.password.trim()) {
      setError('Login ID, Name, and Password are required')
      return
    }
    setSubmitting(true)
    try {
      await createUser({
        login_id: form.login_id.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role.trim().toLowerCase() || 'manager',
        password: form.password,
        status: form.status,
      })
      setForm({ login_id: '', name: '', email: '', role: 'manager', password: '', status: 'active' })
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setSubmitting(false)
    }
  }

  const onSoftDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to disable this user?')) return
    setError('')
    try {
      await softDeleteUser(id)
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
              User List
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              Manage system users and their roles
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            Back to Modules
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Create New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="login-id">Login ID</Label>
                <Input
                  id="login-id"
                  value={form.login_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, login_id: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-role">Role</Label>
                <Input
                  id="user-role"
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  disabled={submitting}
                  placeholder="e.g. manager, accountant"
                />
              </div>
              <div className="lg:col-span-3 pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Create User'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Directory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID, name, email or role"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-3">Login ID</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-3 pr-3">
                        Loading...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-3 pr-3">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className="border-b border-zinc-100">
                        <td className="py-3 pr-3 font-medium">{item.login_id}</td>
                        <td className="py-3 pr-3">{item.name}</td>
                        <td className="py-3 pr-3">{item.email}</td>
                        <td className="py-3 pr-3">{item.role || '-'}</td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {item.status === 'active' ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => void onSoftDelete(item.id)}>
                              Disable
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
    </ModuleSidebarLayout>
  )
}
