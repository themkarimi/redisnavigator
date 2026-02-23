import React, { useState, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Trash2, Plus, Save, Key, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { useDeleteKeysByPattern, useCreateKey } from '@/hooks/useKeys'
import { api } from '@/services/api'
import type { RedisKey, RedisKeyDetail, RedisKeyType } from '@/types'
import { useSettingsStore } from '@/store/settingsStore'

// ─── Type badge ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-500',
  hash:   'bg-yellow-500',
  list:   'bg-green-500',
  set:    'bg-purple-500',
  zset:   'bg-orange-500',
  stream: 'bg-red-500',
  none:   'bg-gray-400',
}

function TypeBadge({ type }: { type: RedisKeyType }) {
  const color = TYPE_COLORS[type] ?? 'bg-gray-400'
  return (
    <Badge className={`${color} text-white text-xs font-mono border-0 hover:${color}`}>
      {type}
    </Badge>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTTL(ttl: number): string {
  if (ttl === -1) return 'No expiry'
  if (ttl === -2) return 'Expired'
  if (ttl < 60) return `${ttl}s`
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`
  const h = Math.floor(ttl / 3600)
  const m = Math.floor((ttl % 3600) / 60)
  return `${h}h ${m}m`
}

function prettyValue(raw: unknown): string {
  if (typeof raw !== 'string') {
    try { return JSON.stringify(raw, null, 2) } catch { return String(raw ?? '') }
  }
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

// ─── Value type aliases ───────────────────────────────────────────────────────

type HashValue   = Record<string, string>
type ListValue   = string[]
type SetValue    = string[]
type ZSetEntry   = { member: string; score: number }
type ZSetValue   = ZSetEntry[]
type StreamEntry = { id: string; fields: Record<string, string> }
type StreamValue = StreamEntry[]

// ─── Shared editor props ──────────────────────────────────────────────────────

interface EditorProps {
  connectionId: string
  keyName: string
  db: number
  detail: RedisKeyDetail
  onRefresh: () => void
}

// ─── String Editor ────────────────────────────────────────────────────────────

function StringEditor({ connectionId, keyName, db, detail, onRefresh }: EditorProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [editValue, setEditValue] = useState(() => prettyValue(detail.value))

  useEffect(() => { setEditValue(prettyValue(detail.value)) }, [detail.value])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.put(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`,
        { value: editValue },
        { params: { db } },
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['key', connectionId, keyName] })
      toast({ title: 'Saved', description: 'String value updated.' })
      onRefresh()
    },
    onError: () => toast({ title: 'Error', description: 'Failed to save.', variant: 'destructive' }),
  })

  return (
    <div className="flex flex-col gap-3 h-full p-4">
      <Textarea
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        className="flex-1 min-h-[280px] font-mono text-sm resize-none"
        spellCheck={false}
      />
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  )
}

// ─── Hash Editor ──────────────────────────────────────────────────────────────

function HashEditor({ connectionId, keyName, db, detail, onRefresh }: EditorProps) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const [editingField, setEditingField]   = useState<string | null>(null)
  const [editFieldVal, setEditFieldVal]   = useState('')
  const [newFieldName, setNewFieldName]   = useState('')
  const [newFieldVal, setNewFieldVal]     = useState('')

  const entries = Object.entries((detail.value as HashValue) ?? {})

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['key', connectionId, keyName] })
    onRefresh()
  }, [qc, connectionId, keyName, onRefresh])

  const upsertMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      const { data } = await api.put(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}/fields/${encodeURIComponent(field)}`,
        { value },
        { params: { db } },
      )
      return data
    },
    onSuccess: (_d, vars) => {
      invalidate()
      toast({ title: 'Field saved', description: `"${vars.field}" updated.` })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update field.', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (field: string) => {
      await api.delete(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}/fields/${encodeURIComponent(field)}`,
        { params: { db } },
      )
    },
    onSuccess: (_d, field) => {
      invalidate()
      toast({ title: 'Deleted', description: `Field "${field}" removed.` })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete field.', variant: 'destructive' }),
  })

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFieldName.trim()) return
    await upsertMutation.mutateAsync({ field: newFieldName.trim(), value: newFieldVal })
    setNewFieldName('')
    setNewFieldVal('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Field</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-8">
                  Hash is empty
                </TableCell>
              </TableRow>
            )}
            {entries.map(([field, val]) => (
              <TableRow key={field}>
                <TableCell className="font-mono text-sm">{field}</TableCell>
                <TableCell>
                  {editingField === field ? (
                    <div className="flex gap-2">
                      <Input
                        value={editFieldVal}
                        autoFocus
                        onChange={(e) => setEditFieldVal(e.target.value)}
                        className="h-7 text-sm font-mono"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            upsertMutation.mutate({ field, value: editFieldVal })
                            setEditingField(null)
                          }
                          if (e.key === 'Escape') setEditingField(null)
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          upsertMutation.mutate({ field, value: editFieldVal })
                          setEditingField(null)
                        }}
                        disabled={upsertMutation.isPending}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditingField(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <span className="font-mono text-sm break-all">{val}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setEditingField(field); setEditFieldVal(val) }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(field)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Separator />

      <form onSubmit={handleAddField} className="flex gap-2 p-3 shrink-0">
        <Input
          placeholder="Field name"
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          className="h-8 text-sm font-mono"
          required
        />
        <Input
          placeholder="Value"
          value={newFieldVal}
          onChange={(e) => setNewFieldVal(e.target.value)}
          className="h-8 text-sm font-mono flex-1"
        />
        <Button size="sm" type="submit" className="h-8 shrink-0" disabled={upsertMutation.isPending}>
          <Plus className="w-3 h-3 mr-1" />
          Add Field
        </Button>
      </form>
    </div>
  )
}

// ─── List Editor ──────────────────────────────────────────────────────────────

function ListEditor({ connectionId, keyName, db, detail, onRefresh }: EditorProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const items: ListValue = (detail.value as ListValue) ?? []

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['key', connectionId, keyName] })
    onRefresh()
  }, [qc, connectionId, keyName, onRefresh])

  const updateMutation = useMutation({
    mutationFn: async (newList: string[]) => {
      const { data } = await api.put(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`,
        { value: newList },
        { params: { db } },
      )
      return data
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: 'Error', description: 'Failed to update list.', variant: 'destructive' }),
  })

  const handleAdd = (position: 'head' | 'tail') => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    const updated = position === 'head' ? [trimmed, ...items] : [...items, trimmed]
    updateMutation.mutate(updated, { onSuccess: () => setNewItem('') })
  }

  const handleDelete = (index: number) => {
    updateMutation.mutate(items.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto divide-y">
        {items.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            List is empty
          </div>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2 group">
            <span className="text-muted-foreground text-xs font-mono w-8 text-right shrink-0">{i}</span>
            <span className="flex-1 font-mono text-sm break-all">{item}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(i)}
              disabled={updateMutation.isPending}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex gap-2 p-3 shrink-0">
        <Input
          placeholder="Value to insert"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="h-8 text-sm font-mono flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd('tail')}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={() => handleAdd('head')}
          disabled={updateMutation.isPending}
          title="Prepend to head (LPUSH)"
        >
          <Plus className="w-3 h-3 mr-1" />
          Head
        </Button>
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={() => handleAdd('tail')}
          disabled={updateMutation.isPending}
          title="Append to tail (RPUSH)"
        >
          <Plus className="w-3 h-3 mr-1" />
          Tail
        </Button>
      </div>
    </div>
  )
}

// ─── Set Editor ───────────────────────────────────────────────────────────────

function SetEditor({ connectionId, keyName, db, detail, onRefresh }: EditorProps) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [newMember, setNewMember] = useState('')
  const members: SetValue = (detail.value as SetValue) ?? []

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['key', connectionId, keyName] })
    onRefresh()
  }, [qc, connectionId, keyName, onRefresh])

  const updateMutation = useMutation({
    mutationFn: async (updated: string[]) => {
      const { data } = await api.put(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`,
        { value: updated },
        { params: { db } },
      )
      return data
    },
    onSuccess: () => invalidate(),
    onError: () => toast({ title: 'Error', description: 'Failed to update set.', variant: 'destructive' }),
  })

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newMember.trim()
    if (!trimmed || members.includes(trimmed)) return
    updateMutation.mutate([...members, trimmed], { onSuccess: () => setNewMember('') })
  }

  const handleRemove = (member: string) => {
    updateMutation.mutate(members.filter((m) => m !== member))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto divide-y">
        {members.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Set is empty
          </div>
        )}
        {members.map((member) => (
          <div key={member} className="flex items-center gap-3 px-4 py-2 group">
            <span className="flex-1 font-mono text-sm break-all">{member}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemove(member)}
              disabled={updateMutation.isPending}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <form onSubmit={handleAdd} className="flex gap-2 p-3 shrink-0">
        <Input
          placeholder="New member"
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          className="h-8 text-sm font-mono flex-1"
          required
        />
        <Button size="sm" type="submit" className="h-8 shrink-0" disabled={updateMutation.isPending}>
          <Plus className="w-3 h-3 mr-1" />
          Add Member
        </Button>
      </form>
    </div>
  )
}

// ─── ZSet Editor ─────────────────────────────────────────────────────────────

function ZSetEditor({ connectionId, keyName, db, detail, onRefresh }: EditorProps) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const [editingMember, setEditingMember] = useState<string | null>(null)
  const [editScore, setEditScore]         = useState('')
  const [newMember, setNewMember]         = useState('')
  const [newScore, setNewScore]           = useState('')

  const entries: ZSetValue = (detail.value as ZSetValue) ?? []
  const sorted = [...entries].sort((a, b) => a.score - b.score)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['key', connectionId, keyName] })
    onRefresh()
  }, [qc, connectionId, keyName, onRefresh])

  const updateMutation = useMutation({
    mutationFn: async (updated: ZSetValue) => {
      const { data } = await api.put(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`,
        { value: updated },
        { params: { db } },
      )
      return data
    },
    onSuccess: () => invalidate(),
    onError: () =>
      toast({ title: 'Error', description: 'Failed to update sorted set.', variant: 'destructive' }),
  })

  const handleSaveScore = (member: string, score: string) => {
    const parsed = parseFloat(score)
    if (isNaN(parsed)) return
    const updated = entries
      .filter((e) => e.member !== member)
      .concat({ member, score: parsed })
    updateMutation.mutate(updated, { onSuccess: () => setEditingMember(null) })
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newMember.trim()
    const parsed  = parseFloat(newScore)
    if (!trimmed || isNaN(parsed)) return
    const updated = entries.filter((e) => e.member !== trimmed).concat({ member: trimmed, score: parsed })
    updateMutation.mutate(updated, { onSuccess: () => { setNewMember(''); setNewScore('') } })
  }

  const handleRemove = (member: string) => {
    updateMutation.mutate(entries.filter((e) => e.member !== member))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Score</TableHead>
              <TableHead>Member</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-8">
                  Sorted set is empty
                </TableCell>
              </TableRow>
            )}
            {sorted.map(({ member, score }) => (
              <TableRow key={member}>
                <TableCell>
                  {editingMember === member ? (
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="any"
                        value={editScore}
                        autoFocus
                        onChange={(e) => setEditScore(e.target.value)}
                        className="h-7 w-24 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveScore(member, editScore)
                          if (e.key === 'Escape') setEditingMember(null)
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleSaveScore(member, editScore)}
                        disabled={updateMutation.isPending}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="font-mono text-sm">{score}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm break-all">{member}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setEditingMember(member); setEditScore(String(score)) }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(member)}
                      disabled={updateMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Separator />

      <form onSubmit={handleAdd} className="flex gap-2 p-3 shrink-0">
        <Input
          placeholder="Member"
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          className="h-8 text-sm font-mono flex-1"
          required
        />
        <Input
          type="number"
          step="any"
          placeholder="Score"
          value={newScore}
          onChange={(e) => setNewScore(e.target.value)}
          className="h-8 w-28 text-sm"
          required
        />
        <Button size="sm" type="submit" className="h-8 shrink-0" disabled={updateMutation.isPending}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </form>
    </div>
  )
}

// ─── Stream Viewer (read-only) ────────────────────────────────────────────────

function StreamViewer({ detail }: { detail: RedisKeyDetail }) {
  const entries: StreamValue = (detail.value as StreamValue) ?? []
  const allFields = Array.from(new Set(entries.flatMap((e) => Object.keys(e.fields ?? {}))))

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <p className="text-sm">Stream is empty.</p>
        <p className="text-xs">Use XADD to append new entries.</p>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Stream entries are read-only. Use <code className="font-mono bg-muted px-1 rounded">XADD</code> to append entries.
      </p>

      {/* Compact card layout per entry */}
      {allFields.length > 0 ? (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44 shrink-0">Entry ID</TableHead>
                {allFields.map((f) => (
                  <TableHead key={f} className="font-mono text-xs">{f}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.id}</TableCell>
                  {allFields.map((f) => (
                    <TableCell key={f} className="font-mono text-sm">
                      {entry.fields?.[f] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className="border rounded-md p-3 space-y-2">
            <p className="font-mono text-xs text-muted-foreground border-b pb-1">{entry.id}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
              {Object.entries(entry.fields ?? {}).map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="text-muted-foreground truncate">{k}</span>
                  <span className="break-all">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Key Detail Right Panel ───────────────────────────────────────────────────

interface KeyDetailPanelProps {
  connectionId: string
  keyName: string
  db: number
  onDeleted: () => void
}

function KeyDetailPanel({ connectionId, keyName, db, onDeleted }: KeyDetailPanelProps) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const detailQuery = useQuery<RedisKeyDetail>({
    queryKey: ['key', connectionId, keyName, db],
    queryFn: async () => {
      const { data } = await api.get<RedisKeyDetail>(
        `/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`,
        { params: { db } },
      )
      return data
    },
    enabled: !!connectionId && !!keyName,
  })

  const detail = detailQuery.data

  const handleRefresh = useCallback(() => { detailQuery.refetch() }, [detailQuery])

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/connections/${connectionId}/keys/${encodeURIComponent(keyName)}`, { params: { db } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys', connectionId] })
      qc.removeQueries({ queryKey: ['key', connectionId, keyName, db] })
      toast({ title: 'Deleted', description: `Key "${keyName}" removed.` })
      onDeleted()
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete key.', variant: 'destructive' }),
  })

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading key details…
      </div>
    )
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <p className="text-sm">Failed to load key details.</p>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  const editorProps: EditorProps = { connectionId, keyName, db, detail, onRefresh: handleRefresh }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start gap-3 px-4 py-3 border-b shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm font-semibold break-all leading-tight" title={keyName}>
            {keyName}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <TypeBadge type={detail.type} />
            <span className="text-xs text-muted-foreground">
              TTL:{' '}
              <span className="font-mono font-medium">{formatTTL(detail.ttl)}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Refresh"
            onClick={handleRefresh}
            disabled={detailQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${detailQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete Key
          </Button>
        </div>
      </div>

      {/* ── Type-specific editor ── */}
      <ScrollArea className="flex-1">
        {detail.type === 'string' && <StringEditor {...editorProps} />}
        {detail.type === 'hash'   && <HashEditor   {...editorProps} />}
        {detail.type === 'list'   && <ListEditor   {...editorProps} />}
        {detail.type === 'set'    && <SetEditor    {...editorProps} />}
        {detail.type === 'zset'   && <ZSetEditor   {...editorProps} />}
        {detail.type === 'stream' && <StreamViewer detail={detail} />}
        {detail.type === 'none'   && (
          <div className="flex items-center justify-center h-full py-20 text-muted-foreground text-sm">
            Key not found or has expired.
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ─── Add Key Dialog ───────────────────────────────────────────────────────────

type CreatableKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset'

interface AddKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  db: number
  onCreated: (key: string) => void
}

function AddKeyDialog({ open, onOpenChange, connectionId, db, onCreated }: AddKeyDialogProps) {
  const { toast } = useToast()
  const createKey = useCreateKey()

  const [keyName, setKeyName]     = useState('')
  const [keyType, setKeyType]     = useState<CreatableKeyType>('string')
  const [ttl, setTtl]             = useState('')

  // Type-specific value fields
  const [stringValue, setStringValue]     = useState('')
  const [hashField, setHashField]         = useState('')
  const [hashValue, setHashValue]         = useState('')
  const [listValue, setListValue]         = useState('')
  const [setMember, setSetMember]         = useState('')
  const [zsetMember, setZsetMember]       = useState('')
  const [zsetScore, setZsetScore]         = useState('0')

  const resetForm = useCallback(() => {
    setKeyName('')
    setKeyType('string')
    setTtl('')
    setStringValue('')
    setHashField('')
    setHashValue('')
    setListValue('')
    setSetMember('')
    setZsetMember('')
    setZsetScore('0')
  }, [])

  useEffect(() => {
    if (open) resetForm()
  }, [open, resetForm])

  const buildValue = (): unknown => {
    switch (keyType) {
      case 'string':
        return stringValue
      case 'hash':
        return hashField.trim() ? { [hashField.trim()]: hashValue } : {}
      case 'list':
        return listValue.trim() ? [listValue.trim()] : []
      case 'set':
        return setMember.trim() ? [setMember.trim()] : []
      case 'zset': {
        const score = parseFloat(zsetScore)
        return zsetMember.trim() ? [{ member: zsetMember.trim(), score: isNaN(score) ? 0 : score }] : []
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyName.trim()) return

    if (keyType === 'zset' && zsetMember.trim() && isNaN(parseFloat(zsetScore))) {
      toast({ title: 'Invalid Score', description: 'Please enter a valid number for the score.', variant: 'destructive' })
      return
    }

    const parsedTtl = ttl ? parseInt(ttl, 10) : undefined
    if (parsedTtl !== undefined && isNaN(parsedTtl)) return

    createKey.mutate(
      {
        connectionId,
        key: keyName.trim(),
        type: keyType,
        value: buildValue(),
        ttl: parsedTtl && parsedTtl > 0 ? parsedTtl : undefined,
      },
      {
        onSuccess: (data) => {
          toast({ title: 'Key Created', description: `Key "${data.key}" created successfully.` })
          onOpenChange(false)
          onCreated(data.key)
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to create key.', variant: 'destructive' })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Key</DialogTitle>
          <DialogDescription>Create a new Redis key with the specified type.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Key name */}
          <div className="space-y-2">
            <Label htmlFor="add-key-name">Key Name *</Label>
            <Input
              id="add-key-name"
              placeholder="e.g. user:1001"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="font-mono text-sm"
              required
              autoFocus
            />
          </div>

          {/* Key type */}
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={keyType} onValueChange={(v) => setKeyType(v as CreatableKeyType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="hash">Hash</SelectItem>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="set">Set</SelectItem>
                <SelectItem value="zset">Sorted Set (ZSet)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific value input */}
          {keyType === 'string' && (
            <div className="space-y-2">
              <Label htmlFor="add-key-string-value">Value</Label>
              <Textarea
                id="add-key-string-value"
                placeholder="Enter string value"
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                className="font-mono text-sm min-h-[80px] resize-none"
              />
            </div>
          )}

          {keyType === 'hash' && (
            <div className="space-y-2">
              <Label>Initial Field</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Field name"
                  value={hashField}
                  onChange={(e) => setHashField(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Value"
                  value={hashValue}
                  onChange={(e) => setHashValue(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          {keyType === 'list' && (
            <div className="space-y-2">
              <Label htmlFor="add-key-list-value">Initial Item</Label>
              <Input
                id="add-key-list-value"
                placeholder="Enter list item"
                value={listValue}
                onChange={(e) => setListValue(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          )}

          {keyType === 'set' && (
            <div className="space-y-2">
              <Label htmlFor="add-key-set-member">Initial Member</Label>
              <Input
                id="add-key-set-member"
                placeholder="Enter set member"
                value={setMember}
                onChange={(e) => setSetMember(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          )}

          {keyType === 'zset' && (
            <div className="space-y-2">
              <Label>Initial Member</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Member"
                  value={zsetMember}
                  onChange={(e) => setZsetMember(e.target.value)}
                  className="font-mono text-sm flex-1"
                />
                <Input
                  type="number"
                  step="any"
                  placeholder="Score"
                  value={zsetScore}
                  onChange={(e) => setZsetScore(e.target.value)}
                  className="text-sm w-24"
                />
              </div>
            </div>
          )}

          {/* TTL */}
          <div className="space-y-2">
            <Label htmlFor="add-key-ttl">TTL (seconds)</Label>
            <Input
              id="add-key-ttl"
              type="number"
              min="0"
              placeholder="No expiry"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              className="text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createKey.isPending || !keyName.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              {createKey.isPending ? 'Creating…' : 'Create Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KeyBrowserPage() {
  const { id: connectionId = '' } = useParams<{ id: string }>()
  const { toast } = useToast()
  const scanCount = useSettingsStore((s) => s.scanCount)
  const deleteByPatternMutation = useDeleteKeysByPattern()

  const [searchInput, setSearchInput]   = useState('*')
  const [pattern, setPattern]           = useState('*')
  const [selectedKey, setSelectedKey]   = useState<string | null>(null)
  const [db, setDb]                     = useState(0)

  const [keys, setKeys]                     = useState<RedisKey[]>([])
  const [scanCursor, setScanCursor]         = useState('0')
  const [hasMore, setHasMore]               = useState(false)
  const [isLoading, setIsLoading]           = useState(false)
  const [isError, setIsError]               = useState(false)
  const [isScanningMore, setIsScanningMore] = useState(false)
  const [reloadTrigger, setReloadTrigger]   = useState(0)
  const [isDeletingByPattern, setIsDeletingByPattern] = useState(false)
  const [addKeyOpen, setAddKeyOpen]         = useState(false)

  // Debounce — also allow explicit search on Enter
  useEffect(() => {
    const t = setTimeout(() => setPattern(searchInput.trim() || '*'), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Load keys from scratch when connectionId, pattern, db, scanCount, or reloadTrigger changes
  useEffect(() => {
    if (!connectionId) return
    let cancelled = false
    setIsLoading(true)
    setIsError(false)
    setKeys([])
    setScanCursor('0')
    setHasMore(false)
    api.get<{ keys: RedisKey[]; cursor: string }>(
      `/connections/${connectionId}/keys`,
      { params: { pattern, db, count: scanCount, cursor: '0' } },
    ).then(({ data }) => {
      if (!cancelled) {
        setKeys(data.keys)
        setScanCursor(data.cursor)
        setHasMore(data.cursor !== '0')
        setIsLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setIsError(true)
        setIsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [connectionId, pattern, db, scanCount, reloadTrigger])

  const handleRefresh = useCallback(() => {
    setReloadTrigger((n) => n + 1)
    toast({ title: 'Refreshed', description: 'Key list reloaded.' })
  }, [toast])

  const handleScanMore = useCallback(() => {
    setIsScanningMore(true)
    api.get<{ keys: RedisKey[]; cursor: string }>(
      `/connections/${connectionId}/keys`,
      { params: { pattern, db, count: scanCount, cursor: scanCursor } },
    ).then(({ data }) => {
      setKeys((prev) => {
        const existing = new Set(prev.map((k) => k.key))
        const newKeys = data.keys.filter((k) => !existing.has(k.key))
        return [...prev, ...newKeys]
      })
      setScanCursor(data.cursor)
      setHasMore(data.cursor !== '0')
      setIsScanningMore(false)
    }).catch(() => {
      toast({ title: 'Error', description: 'Failed to scan more keys.', variant: 'destructive' })
      setIsScanningMore(false)
    })
  }, [connectionId, pattern, db, scanCount, scanCursor, toast])

  const handleSelectKey = useCallback((key: string) => setSelectedKey(key), [])

  const handleDbChange = useCallback((newDb: number) => {
    setDb(newDb)
    setSelectedKey(null)
  }, [])

  const handleKeyDeleted = useCallback(() => {
    setSelectedKey(null)
    setReloadTrigger((n) => n + 1)
  }, [])

  const handleKeyCreated = useCallback((key: string) => {
    setReloadTrigger((n) => n + 1)
    setSelectedKey(key)
  }, [])

  const handleDeleteByPattern = useCallback(() => {
    if (!pattern || pattern === '*') {
      const confirmed = window.confirm(
        'This will delete ALL keys in the selected database. Are you sure?'
      )
      if (!confirmed) return
    } else {
      const confirmed = window.confirm(
        `Delete all keys matching "${pattern}"?`
      )
      if (!confirmed) return
    }
    setIsDeletingByPattern(true)
    deleteByPatternMutation.mutate(
      { connectionId, pattern, db },
      {
        onSuccess: (data) => {
          toast({ title: 'Deleted', description: data.message })
          setSelectedKey(null)
          setReloadTrigger((n) => n + 1)
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to delete keys by pattern.', variant: 'destructive' })
        },
        onSettled: () => setIsDeletingByPattern(false),
      }
    )
  }, [connectionId, pattern, db, toast, deleteByPatternMutation])

  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No connection selected.
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Left panel – Key list                                               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="w-[300px] shrink-0 border-r flex flex-col bg-background">

        {/* Search bar */}
        <div className="p-3 flex flex-col gap-2 border-b shrink-0">
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-muted-foreground shrink-0">DB</span>
            <select
              value={db}
              onChange={(e) => handleDbChange(Number(e.target.value))}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
              title="Select Redis database"
            >
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-sm font-mono"
                placeholder="Pattern, e.g. user:*"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPattern(searchInput.trim() || '*')}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 shrink-0"
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 shrink-0"
              onClick={() => setAddKeyOpen(true)}
              title="Add Key"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Key count and delete by pattern */}
          <div className="flex items-center justify-between pl-0.5">
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Loading…'
                : `${keys.length} key${keys.length !== 1 ? 's' : ''}`}
            </p>
            {!isLoading && keys.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={handleDeleteByPattern}
                disabled={isDeletingByPattern}
                title={`Delete all keys matching "${pattern}"`}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete Keys
              </Button>
            )}
          </div>
        </div>

        {/* Keys */}
        <ScrollArea className="flex-1">
          {isError && (
            <p className="text-xs text-destructive px-3 py-4 text-center">Failed to load keys.</p>
          )}
          {!isLoading && !isError && keys.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
              <Key className="w-8 h-8 opacity-30" />
              <p className="text-xs text-center px-4">
                {pattern === '*' ? 'No keys found.' : `No keys match "${pattern}".`}
              </p>
            </div>
          )}
          <div className="py-1">
            {keys.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => handleSelectKey(k.key)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/60 transition-colors ${
                  selectedKey === k.key ? 'bg-muted' : ''
                }`}
              >
                <Key className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs truncate flex-1 min-w-0">{k.key}</span>
                <TypeBadge type={k.type} />
              </button>
            ))}
          </div>
          {hasMore && (
            <div className="px-3 py-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleScanMore}
                disabled={isScanningMore}
              >
                <ChevronDown className={`w-3.5 h-3.5 mr-1.5 ${isScanningMore ? 'animate-bounce' : ''}`} />
                {isScanningMore ? 'Scanning…' : 'Scan More'}
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Right panel – Key detail                                            */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedKey ? (
          <KeyDetailPanel
            key={`${selectedKey}:${db}`}
            connectionId={connectionId}
            keyName={selectedKey}
            db={db}
            onDeleted={handleKeyDeleted}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground select-none">
            <Key className="w-12 h-12 opacity-25" />
            <div className="text-center">
              <p className="text-sm font-medium">Select a key to view its details</p>
              <p className="text-xs mt-1 opacity-70">Choose a key from the list on the left</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Key Dialog ── */}
      <AddKeyDialog
        open={addKeyOpen}
        onOpenChange={setAddKeyOpen}
        connectionId={connectionId}
        db={db}
        onCreated={handleKeyCreated}
      />

    </div>
  )
}
