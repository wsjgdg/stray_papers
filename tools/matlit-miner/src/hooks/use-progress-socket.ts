'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

// Dynamically import socket.io-client to avoid SSR issues
let ioFn: typeof import('socket.io-client').io | null = null
async function getIo() {
  if (!ioFn) {
    const mod = await import('socket.io-client')
    ioFn = mod.io
  }
  return ioFn
}

export interface ProgressJob {
  id: string
  type: 'classify' | 'extract' | 'search-batch' | 'reclassify' | 'bulk-delete'
  status: 'running' | 'completed' | 'failed'
  total: number
  done: number
  errors: number
  startedAt: number
  message?: string
}

/**
 * Hook to connect to the batch progress WebSocket service.
 * Returns the active jobs and helper functions to start/update/complete jobs.
 */
export function useProgressSocket() {
  const [connected, setConnected] = useState(false)
  const [jobs, setJobs] = useState<ProgressJob[]>([])
  const socketRef = useRef<import('socket.io-client').Socket | null>(null)

  useEffect(() => {
    let socket: import('socket.io-client').Socket | null = null
    let cancelled = false

    getIo().then((io) => {
      if (cancelled) return
      const isDev = window.location.port === '3000'
      socket = io(isDev ? 'http://localhost:3003' : '/?XTransformPort=3003', {
        path: '/',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
      })
      socketRef.current = socket

      socket.on('connect', () => setConnected(true))
      socket.on('disconnect', () => setConnected(false))

      socket.on('jobs-snapshot', (snapshot: ProgressJob[]) => setJobs(snapshot))
      socket.on('job-started', (job: ProgressJob) => setJobs((prev) => [...prev.filter((j) => j.id !== job.id), job]))
      socket.on('job-progress', (job: ProgressJob) => setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j))))
      socket.on('job-completed', (job: ProgressJob) => {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
        setTimeout(() => setJobs((prev) => prev.filter((j) => j.id !== job.id)), 5000)
      })
    })

    return () => {
      cancelled = true
      socket?.disconnect()
    }
  }, [])

  const startJob = useCallback((id: string, type: ProgressJob['type'], total: number) => {
    socketRef.current?.emit('start-job', { id, type, total })
  }, [])

  const updateProgress = useCallback((id: string, done: number, errors?: number, message?: string) => {
    socketRef.current?.emit('update-progress', { id, done, errors, message })
  }, [])

  const completeJob = useCallback((id: string, status?: 'completed' | 'failed', message?: string) => {
    socketRef.current?.emit('complete-job', { id, status, message })
  }, [])

  return { connected, jobs, startJob, updateProgress, completeJob }
}
