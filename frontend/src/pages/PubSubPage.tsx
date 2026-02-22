import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { useConnectionStore } from '@/store/connectionStore'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PubSubMessage {
  id: string
  channel: string
  pattern?: string
  message: string
  timestamp: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = (import.meta as { env: { VITE_API_URL?: string } }).env.VITE_API_URL ?? 'http://localhost:4000'

// Pre-defined palette for channel badge colors (cycles via hash)
const CHANNEL_COLORS: string[] = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'bg-red-500/20 text-red-400 border-red-500/30',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChannelColor(channel: string): string {
  let hash = 0
  for (let i = 0; i < channel.length; i++) {
    hash = (hash * 31 + channel.charCodeAt(i)) >>> 0
  }
  return CHANNEL_COLORS[hash % CHANNEL_COLORS.length]
}

function formatTimestamp(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false })
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PubSubPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === connectionId) ?? null
  const { toast } = useToast()

  // Socket state
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Subscription state
  const [subscribeInput, setSubscribeInput] = useState('')
  const [patternInput, setPatternInput] = useState('')
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([])
  const [activePatterns, setActivePatterns] = useState<string[]>([])

  // Publish state
  const [publishChannel, setPublishChannel] = useState('')
  const [publishMessage, setPublishMessage] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)

  // Message feed
  const [messages, setMessages] = useState<PubSubMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Socket lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!connectionId) return

    const token = useAuthStore.getState().accessToken
    const socket = io(`${BASE_URL}/pubsub`, {
      auth: { connectionId, token },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    socket.on('message', (payload: { channel: string; message: string; timestamp?: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          channel: payload.channel,
          message: typeof payload.message === 'object'
            ? JSON.stringify(payload.message, null, 2)
            : String(payload.message),
          timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        },
      ])
    })

    socket.on('pmessage', (payload: { pattern: string; channel: string; message: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          channel: payload.channel,
          pattern: payload.pattern,
          message: typeof payload.message === 'object'
            ? JSON.stringify(payload.message, null, 2)
            : String(payload.message),
          timestamp: new Date(),
        },
      ])
    })

    socket.on('error', (err: { message?: string } | string) => {
      const msg = typeof err === 'string' ? err : err?.message ?? 'Socket error'
      toast({ title: 'Pub/Sub Error', description: msg, variant: 'destructive' })
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [connectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Auto-scroll messages
  // ---------------------------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---------------------------------------------------------------------------
  // Subscribe actions
  // ---------------------------------------------------------------------------

  const handleSubscribe = useCallback(() => {
    const ch = subscribeInput.trim()
    if (!ch || !socketRef.current) return
    if (activeSubscriptions.includes(ch)) {
      toast({ title: 'Already subscribed', description: `Already subscribed to "${ch}"` })
      return
    }
    socketRef.current.emit('subscribe', { channel: ch })
    setActiveSubscriptions((prev) => [...prev, ch])
    setSubscribeInput('')
  }, [subscribeInput, activeSubscriptions, toast])

  const handleUnsubscribe = useCallback(
    (channel: string) => {
      if (!socketRef.current) return
      socketRef.current.emit('unsubscribe', { channel })
      setActiveSubscriptions((prev) => prev.filter((c) => c !== channel))
    },
    []
  )

  const handlePSubscribe = useCallback(() => {
    const pt = patternInput.trim()
    if (!pt || !socketRef.current) return
    if (activePatterns.includes(pt)) {
      toast({ title: 'Already subscribed', description: `Already subscribed to pattern "${pt}"` })
      return
    }
    socketRef.current.emit('psubscribe', { pattern: pt })
    setActivePatterns((prev) => [...prev, pt])
    setPatternInput('')
  }, [patternInput, activePatterns, toast])

  const handlePUnsubscribe = useCallback(
    (pattern: string) => {
      if (!socketRef.current) return
      socketRef.current.emit('punsubscribe', { pattern })
      setActivePatterns((prev) => prev.filter((p) => p !== pattern))
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Publish action
  // ---------------------------------------------------------------------------

  const handlePublish = useCallback(async () => {
    const ch = publishChannel.trim()
    const msg = publishMessage.trim()
    if (!ch || !msg || !socketRef.current) return
    setIsPublishing(true)
    socketRef.current.emit('publish', { channel: ch, message: msg })
    // Optimistic clear
    setTimeout(() => {
      setPublishMessage('')
      setIsPublishing(false)
    }, 300)
  }, [publishChannel, publishMessage])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Left panel                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card overflow-y-auto">
        {/* Connection header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pub/Sub</h2>
            {connection && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {connection.name}
              </p>
            )}
          </div>
          <StatusPill connected={isConnected} />
        </div>

        {/* Subscribe section */}
        <section className="p-4 border-b border-border space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Subscribe
          </h3>

          {/* Channel subscribe */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Channel</label>
            <div className="flex gap-2">
              <Input
                value={subscribeInput}
                onChange={(e) => setSubscribeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
                placeholder="e.g. news"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                onClick={handleSubscribe}
                disabled={!isConnected || !subscribeInput.trim()}
                className="h-8 text-xs shrink-0"
              >
                Subscribe
              </Button>
            </div>
          </div>

          {/* Pattern subscribe */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Pattern</label>
            <div className="flex gap-2">
              <Input
                value={patternInput}
                onChange={(e) => setPatternInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePSubscribe()}
                placeholder="e.g. news.*"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handlePSubscribe}
                disabled={!isConnected || !patternInput.trim()}
                className="h-8 text-xs shrink-0"
              >
                PSubscribe
              </Button>
            </div>
          </div>

          {/* Active subscriptions list */}
          {(activeSubscriptions.length > 0 || activePatterns.length > 0) && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-muted-foreground font-medium">Active</p>
              {activeSubscriptions.map((ch) => (
                <SubscriptionPill
                  key={`ch-${ch}`}
                  label={ch}
                  type="channel"
                  onRemove={() => handleUnsubscribe(ch)}
                />
              ))}
              {activePatterns.map((pt) => (
                <SubscriptionPill
                  key={`pt-${pt}`}
                  label={pt}
                  type="pattern"
                  onRemove={() => handlePUnsubscribe(pt)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Publish section */}
        <section className="p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Publish
          </h3>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Channel</label>
            <Input
              value={publishChannel}
              onChange={(e) => setPublishChannel(e.target.value)}
              placeholder="e.g. news"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Message</label>
            <textarea
              value={publishMessage}
              onChange={(e) => setPublishMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handlePublish()
                }
              }}
              placeholder="Message content..."
              rows={4}
              className={cn(
                'w-full resize-none rounded-md border border-input bg-background px-3 py-2',
                'text-xs placeholder:text-muted-foreground focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:opacity-50'
              )}
            />
          </div>
          <Button
            className="w-full h-8 text-xs"
            onClick={handlePublish}
            disabled={!isConnected || !publishChannel.trim() || !publishMessage.trim() || isPublishing}
          >
            {isPublishing ? 'Publishing...' : 'Publish (Ctrl+Enter)'}
          </Button>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right panel — message feed                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Feed header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Message Feed</h2>
            {messages.length > 0 && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-mono">
                {messages.length.toLocaleString()} msg{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              className="h-7 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Subscribe to a channel to see messages
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => <MessageCard key={msg.id} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
        connected
          ? 'bg-green-500/10 text-green-500 border-green-500/30'
          : 'bg-gray-500/10 text-gray-400 border-gray-600/30'
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
        )}
      />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  )
}

interface SubscriptionPillProps {
  label: string
  type: 'channel' | 'pattern'
  onRemove: () => void
}

function SubscriptionPill({ label, type, onRemove }: SubscriptionPillProps) {
  return (
    <div className="flex items-center justify-between py-1 px-2.5 rounded-md bg-muted/60 border border-border/50 group">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wide shrink-0 px-1 py-0.5 rounded',
            type === 'pattern'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-blue-500/20 text-blue-400'
          )}
        >
          {type === 'pattern' ? 'pat' : 'ch'}
        </span>
        <span className="text-xs text-foreground font-mono truncate" title={label}>
          {label}
        </span>
      </div>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0 opacity-0 group-hover:opacity-100"
        title="Unsubscribe"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

interface MessageCardProps {
  msg: PubSubMessage
}

function MessageCard({ msg }: MessageCardProps) {
  const colorClass = getChannelColor(msg.channel)
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5 hover:border-muted-foreground/20 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {formatTimestamp(msg.timestamp)}
        </span>
        <span
          className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full border font-mono',
            colorClass
          )}
        >
          {msg.channel}
        </span>
        {msg.pattern && (
          <span className="text-[10px] text-muted-foreground font-mono">
            via pattern{' '}
            <span className="text-purple-400">{msg.pattern}</span>
          </span>
        )}
      </div>
      <pre className="text-sm text-foreground whitespace-pre-wrap break-all font-mono leading-relaxed">
        {msg.message}
      </pre>
    </div>
  )
}
