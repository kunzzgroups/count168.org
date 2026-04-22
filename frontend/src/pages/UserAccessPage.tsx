import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ModuleSidebarLayout } from '@/components/ModuleSidebarLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { formatApiError } from '@/lib/formatApiError'
import {
  copyPermissions,
  getAllUsersAccess,
  type UserAccessItem,
} from '@/services/userAccessService'

const AVAILABLE_PERMISSIONS = [
  { id: 'home', label: 'Home / Dashboard' },
  { id: 'admin', label: 'Administration' },
  { id: 'account', label: 'Account List' },
  { id: 'process', label: 'Process List' },
  { id: 'datacapture', label: 'Data Capture' },
  { id: 'payment', label: 'Payment' },
  { id: 'report', label: 'Reports' },
  { id: 'maintenance', label: 'Maintenance' },
]

export default function UserAccessPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  
  const [users, setUsers] = useState<UserAccessItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  
  // Selection states
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAllUsersAccess()
      setUsers(data)
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
  }, [])

  const toggleUser = (userId: number) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    )
  }
  
  const selectAllUsers = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(users.map(u => u.id))
    }
  }

  const copyFromUser = (user: UserAccessItem) => {
    setSelectedPermissions(user.permissions || [])
    setSuccessMsg(`Loaded permissions from ${user.name}`)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    
    if (selectedUsers.length === 0) {
      setError('Please select at least one user to update.')
      return
    }

    setSubmitting(true)
    try {
      const result = await copyPermissions({
        affected_user_ids: selectedUsers,
        permissions: selectedPermissions,
        account_permissions: [], // Extendable later
        process_permissions: [], // Extendable later
      })
      setSuccessMsg(`Successfully updated permissions for ${result.success_count} user(s).`)
      setSelectedUsers([]) // Reset selection after success
      await fetchUsers() // Refresh list to show new permissions
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              User Access Control
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              Assign or copy module permissions across users
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            Back to Modules
          </Button>
        </header>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
          </Card>
        )}
        
        {successMsg && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-4 text-sm text-green-700">{successMsg}</CardContent>
          </Card>
        )}

        <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Users List */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Select Users to Update</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={selectAllUsers}>
                {selectedUsers.length === users.length && users.length > 0 ? 'Deselect All' : 'Select All'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-600">
                      <th className="py-2 pr-3 w-10">Select</th>
                      <th className="py-2 pr-3">Name / Login ID</th>
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3">Current Permissions</th>
                      <th className="py-2 pr-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-zinc-500">Loading users...</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-zinc-500">No users found.</td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => toggleUser(user.id)}
                              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                            />
                          </td>
                          <td className="py-2 pr-3 font-medium">
                            {user.name} <span className="text-zinc-500 text-xs font-normal">({user.login_id})</span>
                          </td>
                          <td className="py-2 pr-3 text-xs uppercase tracking-wider">{user.role || '-'}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {user.permissions && user.permissions.length > 0 ? (
                                user.permissions.map(p => (
                                  <span key={p} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">
                                    {p}
                                  </span>
                                ))
                              ) : (
                                <span className="text-zinc-400 text-xs">None</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => copyFromUser(user)}>
                              Use as Template
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

          {/* Right Column: Permissions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Permissions to Apply</CardTitle>
                <p className="text-sm text-zinc-500">Select the modules the chosen users will have access to.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <div key={perm.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`perm-${perm.id}`}
                        checked={selectedPermissions.includes(perm.id)}
                        onChange={() => togglePermission(perm.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                      />
                      <Label htmlFor={`perm-${perm.id}`} className="font-normal cursor-pointer">
                        {perm.label}
                      </Label>
                    </div>
                  ))}
                </div>
                
                <div className="pt-6 border-t border-zinc-100">
                  <Button type="submit" className="w-full" disabled={submitting || selectedUsers.length === 0}>
                    {submitting ? 'Applying...' : `Apply to ${selectedUsers.length} User(s)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>

      </div>
    </ModuleSidebarLayout>
  )
}
