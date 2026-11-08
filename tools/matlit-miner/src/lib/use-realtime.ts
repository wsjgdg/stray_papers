'use client'

/**
 * P2-10 — Realtime collaboration hook (Socket.io client).
 *
 * Connects to the standalone realtime mini-service on port 3004 via the
 * gateway: `io("/?XTransformPort=3004")`. The service broadcasts three kinds
 * of events (see `mini-services/realtime-service/index.ts`):
 *
 *   - `job:progress`     { jobId, completed, total, status, message? }
 *   - `notification:new` { materialId, materialName, newCount, latestPaperTitle?, latestPaperDate? }
 *   - `comment:new`      { targetType, targetId, author, text, createdAt }
 *
 * On each event the hook fans out to the right store/handler:
 *
 *   - `job:progress`     → Zustand `useJobStore` (updates `completed`/`status`
 *                          for an existing job, or no-op if the job id isn't
 *                          tracked locally — the run dialog registers the job
 *                          id when the user confirms a batch, so this is the
 *                          signal that the server-side pipeline made progress).
 *   - `notification:new` → optional `onNotification(payload)` callback
 *                          (the page uses it to invalidate the notifications
 *                          React Query so the bell badge refreshes).
 *   - `comment:new`      → dispatches the same `matlit:comments-changed`
 *                          custom event that `comments-store.ts` already
 *                          listens for, so any mounted `useComments` /
 *                          `useCommentCount` hook re-renders automatically.
 *                          Also calls optional `onComment(payload)`.
 *
 * Reconnection is handled by socket.io-client itself (5 attempts, 1 s backoff).
 * If the realtime service is unreachable, the hook degrades silently — the
 * existing 5-min notification poll and per-job timer-based progress still
 * work as fallbacks.
 *
 * Why dynamic import? `socket.io-client` references `window` at module load
 * time; importing it lazily inside `useEffect` avoids SSR errors when the
 * page is server-rendered.
 */
import { useEffect, useRef, useState } from 'react'
import { useJobStore, type JobStatus } from '@/lib/job-store'

// ─── Event payload types ───────────────────────────────────────────────────

export interface JobProgressPayload {
  jobId: string
  completed: number
  total: number
  status: 'running' | 'done' | 'error' | 'completed' | 'failed'
  message?: string
}

export interface NotificationPayload {
  materialId: string
  materialName: string
  newCount: number
  latestPaperTitle?: string
  latestPaperDate?: string
}

export interface CommentPayload {
  targetType: 'material' | 'paper'
  targetId: string
  author: string
  text: string
  createdAt: number
}

interface UseRealtimeOptions {
  /** Called when a `notification:new` event arrives. */
  onNotification?: (payload: NotificationPayload) => void
  /** Called when a `comment:new` event arrives (after the store event fires). */
  onComment?: (payload: CommentPayload) => void
  /** Called when a `job:progress` event arrives (after job-store is updated). */
  onJobProgress?: (payload: JobProgressPayload) => void
  /**
   * Optional room to subscribe to on connect (e.g. `material:<id>`).
   * The hook (re)subscribes whenever this changes.
   */
  room?: string
}

interface UseRealtimeReturn {
  /** True when the socket is connected to the realtime service. */
  connected: boolean
  /** Last error reported by the socket (reconnection still attempts). */
  error: string | null
  /**
   * Imperatively subscribe to an additional room after mount (e.g. when the
   * user navigates to a new material). Safe to call before `connected` is
   * true — the request is buffered and sent on connect.
   */
  subscribe: (room: string) => void
  /** Imperatively leave a room. */
  unsubscribe: (room: string) => void
}

/** Custom event the comments-store listens for (re-reads localStorage). */
const COMMENTS_CHANGE_EVENT = 'matlit:comments-changed'

/** Map the realtime service's status string to our JobStore's JobStatus. */
function toJobStatus(s: JobProgressPayload['status']): JobStatus | null {
  switch (s) {
    case 'running':
      return 'running'
    case 'done':
    case 'completed':
      return 'done'
    case 'error':
    case 'failed':
      return 'error'
    default:
      return null
  }
}

export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const { onNotification, onComment, onJobProgress, room } = options
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<import('socket.io-client').Socket | null>(null)

  // Keep latest callbacks in refs so the socket listeners (registered once)
  // always see the latest closure without needing to re-subscribe on every
  // render.
  const onNotifRef = useRef(onNotification)
  const onCommentRef = useRef(onComment)
  const onJobRef = useRef(onJobProgress)
  useEffect(() => {
    onNotifRef.current = onNotification
  }, [onNotification])
  useEffect(() => {
    onCommentRef.current = onComment
  }, [onComment])
  useEffect(() => {
    onJobRef.current = onJobProgress
  }, [onJobProgress])

  const updateJob = useJobStore((s) => s.updateJob)
  const updateJobRef = useRef(updateJob)
  useEffect(() => {
    updateJobRef.current = updateJob
  }, [updateJob])

  // Track rooms the user has joined so we can re-subscribe after a reconnect.
  const joinedRoomsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let socket: import('socket.io-client').Socket | null = null
    let cancelled = false

    async function connect() {
      const mod = await import('socket.io-client')
      if (cancelled) return
      // IMPORTANT: per the gateway rule, the URL is `/?XTransformPort=3004`
      // — the leading `/` becomes socket.io's `path` option (so engine.io
      // on the server with `path: '/'` matches). Never use an absolute
      // `http://localhost:3004` URL here.
      socket = mod.io('/?XTransformPort=3004', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
        timeout: 10_000,
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setConnected(true)
        setError(null)
        // Re-subscribe to any rooms the user had joined before a disconnect.
        for (const r of joinedRoomsRef.current) {
          socket?.emit('subscribe', { room: r })
        }
        // Subscribe to the initial room prop, if any.
        if (room && !joinedRoomsRef.current.has(room)) {
          joinedRoomsRef.current.add(room)
          socket?.emit('subscribe', { room })
        }
      })

      socket.on('disconnect', (reason: string) => {
        setConnected(false)
        setError(reason)
      })

      socket.on('connect_error', (err: Error) => {
        setConnected(false)
        setError(err.message)
      })

      socket.on('job:progress', (payload: JobProgressPayload) => {
        if (!payload || typeof payload.jobId !== 'string') return
        const status = toJobStatus(payload.status)
        const patch: Parameters<typeof updateJobRef.current>[1] = {}
        if (typeof payload.completed === 'number') patch.completed = payload.completed
        if (typeof payload.total === 'number') patch.total = payload.total
        if (payload.message) patch.error = payload.message
        if (status) patch.status = status
        updateJobRef.current(payload.jobId, patch)
        onJobRef.current?.(payload)
      })

      socket.on('notification:new', (payload: NotificationPayload) => {
        if (!payload || typeof payload.materialId !== 'string') return
        onNotifRef.current?.(payload)
      })

      socket.on('comment:new', (payload: CommentPayload) => {
        if (!payload || typeof payload.targetId !== 'string') return
        // Re-broadcast as the same custom event the comments-store already
        // listens for. Any mounted useComments / useCommentCount hook will
        // re-read localStorage and re-render. (We don't write the comment to
        // localStorage here — the server side already persisted it via the
        // API route that emitted the event. The browser fetches fresh
        // comments from the store on the next render cycle. For the demo,
        // the comment author's own tab already wrote it locally; the WS
        // event is what syncs *other* tabs.)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(COMMENTS_CHANGE_EVENT))
        }
        onCommentRef.current?.(payload)
      })
    }

    void connect()

    return () => {
      cancelled = true
      socket?.disconnect()
      socketRef.current = null
    }
    // We intentionally do NOT include `room` here — the room is handled by
    // the separate effect below so we don't tear down the socket every time
    // the user navigates between materials.
  }, [])

  // Subscribe / unsubscribe when the `room` option changes.
  useEffect(() => {
    if (!room) return
    const socket = socketRef.current
    if (!socket) return
    if (!joinedRoomsRef.current.has(room)) {
      joinedRoomsRef.current.add(room)
      socket.emit('subscribe', { room })
    }
    return () => {
      // When the room changes, leave the previous one so we stop receiving
      // targeted broadcasts for a material the user is no longer viewing.
      if (joinedRoomsRef.current.has(room)) {
        joinedRoomsRef.current.delete(room)
        socket.emit('unsubscribe', room)
      }
    }
  }, [room])

  const subscribe = (newRoom: string) => {
    if (!newRoom) return
    joinedRoomsRef.current.add(newRoom)
    socketRef.current?.emit('subscribe', { room: newRoom })
  }
  const unsubscribe = (oldRoom: string) => {
    if (!oldRoom) return
    joinedRoomsRef.current.delete(oldRoom)
    socketRef.current?.emit('unsubscribe', oldRoom)
  }

  return { connected, error, subscribe, unsubscribe }
}
