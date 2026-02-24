import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/services/api'
import { useConnectionStore } from '@/store/connectionStore'
import { useToast } from '@/hooks/use-toast'
import { useFeatures } from '@/hooks/useFeatures'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandEntry {
  type: 'input' | 'output' | 'error'
  text: string
  timestamp: Date
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_BLOCKED_COMMANDS = ['FLUSHALL', 'CONFIG', 'REPLICAOF', 'SLAVEOF', 'DEBUG', 'SHUTDOWN']

const ALL_SUGGESTION_CHIPS: string[] = [
  'PING',
  'INFO',
  'DBSIZE',
  'SET key value',
  'GET key',
  'TTL key',
  'TYPE key',
  'KEYS *',
  'SCAN 0',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatResponse(result: unknown): string {
  if (result === null || result === undefined) return '(nil)'
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2)
  }
  if (Array.isArray(result)) {
    return (result as unknown[]).join('\n')
  }
  return String(result)
}

function isBlockedCommand(input: string, blockedCommands: Set<string>): string | null {
  const cmd = input.trim().split(/\s+/)[0]?.toUpperCase()
  if (cmd && blockedCommands.has(cmd)) {
    return cmd
  }
  return null
}

function formatTimestamp(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CLIPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const connections = useConnectionStore((s) => s.connections)
  const connection = connections.find((c) => c.id === connectionId) ?? null
  const { toast } = useToast()
  const { data: features } = useFeatures()

  const blockedCommands = useMemo(
    () => new Set([...BASE_BLOCKED_COMMANDS, ...(features?.disabledCommands ?? [])]),
    [features?.disabledCommands]
  )
  const suggestionChips = useMemo(
    () => ALL_SUGGESTION_CHIPS.filter(
      (chip) => !blockedCommands.has(chip.split(/\s+/)[0].toUpperCase())
    ),
    [blockedCommands]
  )

  const [history, setHistory] = useState<CommandEntry[]>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [currentInput, setCurrentInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const outputEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Welcome message
  useEffect(() => {
    if (connection) {
      setHistory([
        {
          type: 'output',
          text: `Connected to ${connection.host}:${connection.port} — Type HELP for available commands`,
          timestamp: new Date(),
        },
      ])
    }
  }, [connection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const appendEntry = useCallback((entry: CommandEntry) => {
    setHistory((prev) => [...prev, entry])
  }, [])

  const clearOutput = useCallback(() => {
    setHistory([])
  }, [])

  const executeCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      // Add to command history (dedup consecutive)
      setCommandHistory((prev) => {
        if (prev[prev.length - 1] === trimmed) return prev
        return [...prev, trimmed]
      })
      setHistoryIndex(-1)

      // Echo input
      appendEntry({ type: 'input', text: trimmed, timestamp: new Date() })

      // Built-in: clear
      if (trimmed.toLowerCase() === 'clear') {
        clearOutput()
        return
      }

      // Blocked command warning
      const blocked = isBlockedCommand(trimmed, blockedCommands)
      if (blocked) {
        appendEntry({
          type: 'error',
          text: `Warning: "${blocked}" is a potentially destructive or restricted command. If you really need to run it, use your Redis client directly.`,
          timestamp: new Date(),
        })
        return
      }

      if (!connectionId) return

      setIsLoading(true)
      try {
        const { data } = await api.post(`/connections/${connectionId}/cli`, {
          command: trimmed,
        })

        const text = formatResponse(data?.result ?? data)
        appendEntry({ type: 'output', text, timestamp: new Date() })
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
        const msg =
          axiosErr?.response?.data?.message ?? axiosErr?.message ?? 'Unknown error'
        appendEntry({ type: 'error', text: `(error) ${msg}`, timestamp: new Date() })
        toast({ title: 'CLI Error', description: msg, variant: 'destructive' })
      } finally {
        setIsLoading(false)
      }
    },
    [connectionId, appendEntry, clearOutput, toast, blockedCommands]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        executeCommand(currentInput)
        setCurrentInput('')
        return
      }

      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        clearOutput()
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHistoryIndex((prev) => {
          const nextIdx = prev === -1 ? commandHistory.length - 1 : Math.max(0, prev - 1)
          setCurrentInput(commandHistory[nextIdx] ?? '')
          return nextIdx
        })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHistoryIndex((prev) => {
          if (prev === -1 || prev >= commandHistory.length - 1) {
            setCurrentInput('')
            return -1
          }
          const nextIdx = prev + 1
          setCurrentInput(commandHistory[nextIdx] ?? '')
          return nextIdx
        })
        return
      }
    },
    [executeCommand, clearOutput, commandHistory, currentInput]
  )

  const handleSuggestionClick = useCallback(
    (chip: string) => {
      setCurrentInput(chip)
      inputRef.current?.focus()
    },
    []
  )

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-sm font-mono"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-gray-300 text-xs font-semibold tracking-wide uppercase">
            Redis CLI
          </span>
          {connection && (
            <span className="text-gray-500 text-xs ml-2">
              {connection.name} — {connection.host}:{connection.port}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            clearOutput()
          }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          Clear
        </button>
      </div>

      {/* Suggestion chips */}
      <div
        className="flex items-center gap-1.5 px-4 py-2 bg-gray-900/50 border-b border-gray-800/60 shrink-0 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-600 text-xs mr-1">Quick:</span>
        {suggestionChips.map((chip) => (
          <button
            key={chip}
            onClick={() => handleSuggestionClick(chip)}
            className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:border-green-700 hover:text-green-400 hover:bg-green-950/40 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
        {history.map((entry, i) => (
          <HistoryEntry key={i} entry={entry} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>Executing...</span>
          </div>
        )}
        <div ref={outputEndRef} />
      </div>

      {/* Input row */}
      <div
        className="flex items-center gap-0 px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-green-500 select-none mr-2 shrink-0">redis&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => {
            setCurrentInput(e.target.value)
            setHistoryIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type a command..."
          className={cn(
            'flex-1 bg-transparent outline-none text-green-400 placeholder:text-gray-700',
            'caret-green-400 selection:bg-green-900/60',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        />
        {isLoading && (
          <div className="w-3 h-3 border border-green-500 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HistoryEntry sub-component
// ---------------------------------------------------------------------------

interface HistoryEntryProps {
  entry: CommandEntry
}

function HistoryEntry({ entry }: HistoryEntryProps) {
  if (entry.type === 'input') {
    return (
      <div className="flex items-start gap-2">
        <span className="text-green-600 shrink-0 select-none text-xs mt-px">
          {formatTimestamp(entry.timestamp)}
        </span>
        <span className="text-green-500 shrink-0 select-none">redis&gt;</span>
        <span className="text-green-400 break-all">{entry.text}</span>
      </div>
    )
  }

  if (entry.type === 'error') {
    return (
      <div className="flex items-start gap-2">
        <span className="text-gray-700 shrink-0 select-none text-xs mt-px">
          {formatTimestamp(entry.timestamp)}
        </span>
        <pre className="text-red-400 whitespace-pre-wrap break-all font-mono text-sm leading-relaxed">
          {entry.text}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-700 shrink-0 select-none text-xs mt-px">
        {formatTimestamp(entry.timestamp)}
      </span>
      <pre className="text-gray-200 whitespace-pre-wrap break-all font-mono text-sm leading-relaxed">
        {entry.text}
      </pre>
    </div>
  )
}
