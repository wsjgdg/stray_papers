import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server } from 'socket.io'

// MatLit Miner — Batch Progress WebSocket Service
// Port 3003. Caddy forwards /?XTransformPort=3003 to this port.
// Frontend connects via io('/?XTransformPort=3003')

interface ProgressJob {
  id: string
  type: 'classify' | 'extract' | 'search-batch' | 'reclassify' | 'bulk-delete'
  status: 'running' | 'completed' | 'failed'
  total: number
  done: number
  errors: number
  startedAt: number
  message?: string
}

const jobs = new Map<string, ProgressJob>()

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Simple health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, jobs: jobs.size }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ service: 'matlit-progress', port: 3003 }))
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[progress] Client connected: ${socket.id}`)

  // Send current jobs on connect
  socket.emit('jobs-snapshot', Array.from(jobs.values()))

  // Start a new progress job (frontend calls this before starting a batch operation)
  socket.on('start-job', (data: { id: string; type: ProgressJob['type']; total: number }) => {
    const job: ProgressJob = {
      id: data.id,
      type: data.type,
      status: 'running',
      total: data.total,
      done: 0,
      errors: 0,
      startedAt: Date.now(),
    }
    jobs.set(data.id, job)
    io.emit('job-started', job)
    console.log(`[progress] Job started: ${data.id} (${data.type}, total=${data.total})`)
  })

  // Update progress (frontend polls its own mutation and emits updates)
  socket.on('update-progress', (data: { id: string; done: number; errors?: number; message?: string }) => {
    const job = jobs.get(data.id)
    if (!job) return
    job.done = data.done
    if (data.errors !== undefined) job.errors = data.errors
    if (data.message) job.message = data.message
    io.emit('job-progress', job)
  })

  // Complete a job
  socket.on('complete-job', (data: { id: string; status?: 'completed' | 'failed'; message?: string }) => {
    const job = jobs.get(data.id)
    if (!job) return
    job.status = data.status || 'completed'
    if (data.message) job.message = data.message
    job.done = job.total
    io.emit('job-completed', job)
    console.log(`[progress] Job completed: ${data.id} (${job.status})`)
    // Clean up after 30 seconds
    setTimeout(() => jobs.delete(data.id), 30000)
  })

  socket.on('disconnect', () => {
    console.log(`[progress] Client disconnected: ${socket.id}`)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[progress] WebSocket service running on port ${PORT}`)
})

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
