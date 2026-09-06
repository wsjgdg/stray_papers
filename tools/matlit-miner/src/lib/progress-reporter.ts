import { io } from 'socket.io-client'

// Singleton socket client for server-side progress reporting
let _socket: ReturnType<typeof io> | null = null

function getSocket() {
  if (!_socket) {
    _socket = io('http://localhost:3003', {
      path: '/',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
    })
  }
  return _socket
}

/**
 * Report progress for a batch job from the server side.
 * This connects to the progress-service WebSocket and emits updates.
 */
export function reportProgress(jobId: string, done: number, total: number, errors: number, message?: string) {
  try {
    const socket = getSocket()
    if (socket.connected) {
      socket.emit('update-progress', { id: jobId, done, errors, message })
    } else {
      // Try to connect and emit
      socket.connect()
      socket.on('connect', () => {
        socket.emit('update-progress', { id: jobId, done, errors, message })
      })
    }
  } catch {
    // Silently fail — progress reporting is best-effort
  }
}

export function reportJobStart(jobId: string, type: string, total: number) {
  try {
    const socket = getSocket()
    const emit = () => socket.emit('start-job', { id: jobId, type, total })
    if (socket.connected) emit()
    else {
      socket.connect()
      socket.on('connect', emit)
    }
  } catch {
    // ignore
  }
}

export function reportJobComplete(jobId: string, status: 'completed' | 'failed' = 'completed', message?: string) {
  try {
    const socket = getSocket()
    const emit = () => socket.emit('complete-job', { id: jobId, status, message })
    if (socket.connected) emit()
    else {
      socket.connect()
      socket.on('connect', () => emit())
    }
  } catch {
    // ignore
  }
}
