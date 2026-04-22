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
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  type AnnouncementItem,
} from '@/services/announcementService'

export default function AnnouncementPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const [form, setForm] = useState({
    title: '',
    content: '',
  })

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAnnouncements(search.trim())
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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and Content are required')
      return
    }
    setSubmitting(true)
    try {
      if (editingId) {
        await updateAnnouncement({
          id: editingId,
          title: form.title.trim(),
          content: form.content.trim(),
          status: 'active', // Assuming active by default
        })
        setEditingId(null)
      } else {
        await createAnnouncement({
          title: form.title.trim(),
          content: form.content.trim(),
        })
      }
      setForm({ title: '', content: '' })
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    } finally {
      setSubmitting(false)
    }
  }

  const onEdit = (item: AnnouncementItem) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      content: item.content,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onCancelEdit = () => {
    setEditingId(null)
    setForm({ title: '', content: '' })
  }

  const onDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this announcement? This action cannot be undone.')) return
    setError('')
    try {
      await deleteAnnouncement(id)
      await fetchList()
    } catch (err) {
      setError(formatApiError(t, err))
    }
  }

  return (
    <ModuleSidebarLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(2.0rem,0.625vw+1.2rem,2.4rem)] font-semibold text-zinc-900">
              Announcements
            </h1>
            <p className="text-[clamp(1.2rem,0.15vw+1.0rem,1.3rem)] text-zinc-500">
              Manage system-wide announcements for users
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/modules')}>
            Back to Modules
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Announcement' : 'Post New Announcement'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  disabled={submitting}
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-content">Content</Label>
                <textarea
                  id="ann-content"
                  value={form.content}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                  disabled={submitting}
                  rows={5}
                  className="flex w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : (editingId ? 'Save Changes' : 'Post Announcement')}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={onCancelEdit} disabled={submitting}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search announcements..."
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            <div className="space-y-4">
              {loading ? (
                <div className="py-4 text-center text-sm text-zinc-500">Loading announcements...</div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
                  No announcements found.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {items.map((item) => (
                    <div key={item.id} className="p-4 rounded-lg border border-zinc-200 bg-white shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg text-zinc-900">{item.title}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-600 whitespace-pre-wrap">{item.content}</p>
                        <div className="text-xs text-zinc-400 pt-2 flex items-center gap-4">
                          <span>Posted by: {item.created_by}</span>
                          <span>{item.created_at}</span>
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(item)}>
                          Edit
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void onDelete(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
