/**
 * MatLit Miner — Realtime collaboration WebSocket service (P2-10).
 *
 * Runs TWO HTTP servers in the same process, sharing a single `io` instance:
 *
 *   - Port 3004 — Socket.io server with `path: '/'`. The frontend connects
 *     via `io("/?XTransformPort=3004")` (Caddy forwards the WS upgrade to
 *     this port). With `path: '/'` engine.io intercepts every request on
 *     this port, so we DON'T expose any HTTP routes here — only the
 *     WebSocket handshake. (Same convention as `mini-services/progress-service`.)
 *
 *   - Port 3005 — plain HTTP server exposing `/emit` and `/health`. Other
 *     Next.js API routes (classify, papers search, comments, …) POST an
 *     event payload to `http://localhost:3005/emit` from the server side;
 *     this handler then calls `io.emit(event, data)` to broadcast to every
 *     connected client (or, optionally, only to clients who joined a room
 *     for a specific material/paper via the `subscribe` event).
 *
 * Why two ports? Because the gateway rule requires `path: '/'` on the
 * Socket.io server (so `io("/?XTransformPort=3004")` works through Caddy),
 * and engine.io with `path: '/'` intercepts ALL HTTP requests — leaving no
 * room for a plain HTTP `/emit` endpoint on the same port. Splitting the
 * listeners is the simplest fix: WS clients hit port 3004, the internal
 * HTTP emit API hits port 3005, and they share the same broadcast bus.
 *
 * Supported broadcast events:
 *   - `job:progress`        { jobId, completed, total, status, message? }
 *   - `notification:new`    { materialId, materialName, newCount, latestPaperTitle?, latestPaperDate? }
 *   - `comment:new`         { targetType, targetId, author, text, createdAt }
 *
 * Client → server events:
 *   - `subscribe`    { room }   — join a room (e.g. `material:<id>` or `paper:<id>`)
 *   - `unsubscribe`  { room }   — leave a room
 */
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

interface EmitBody {
  event: 'job:progress' | 'notification:new' | 'comment:new' | string
  data: Record<string, unknown>
  /** Optional room to restrict the broadcast to (e.g. `material:abc`). */
  room?: string
}

interface SubscribePayload {
  room?: string
}

/**
 * Plain HTTP server on port 3005 — exposes `/emit` and `/health`.
 * Called internally by Next.js API routes (server-side, no Caddy involved).
 */
const emitServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        service: 'matlit-realtime',
        wsPort: 3004,
        httpPort: 3005,
        clients: io.engine.clientsCount,
      }),
    )
    return
  }

  if (req.url === '/emit' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      // Cap payload size at 64 KB to avoid abuse — our events are tiny.
      if (body.length > 64 * 1024) {
        req.destroy()
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'payload too large' }))
      }
    })
    req.on('end', () => {
      let payload: EmitBody
      try {
        payload = JSON.parse(body) as EmitBody
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid JSON' }))
        return
      }
      if (!payload || typeof payload.event !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'missing `event` field' }))
        return
      }
      const data = payload.data ?? {}
      if (payload.room) {
        io.to(payload.room).emit(payload.event, data)
      } else {
        io.emit(payload.event, data)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          event: payload.event,
          room: payload.room ?? null,
          clients: io.engine.clientsCount,
        }),
      )
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found', endpoints: ['GET /health', 'POST /emit'] }))
})

/**
 * Socket.io server on port 3004 — frontend connects via Caddy using
 * `io("/?XTransformPort=3004")`. `path: '/'` is required by the gateway.
 *
 * NOTE: we construct the Server WITHOUT an HTTP server argument so engine.io
 * is NOT attached to `emitServer` (which would otherwise intercept every
 * HTTP request on port 3005, breaking `/emit` and `/health`). We then
 * explicitly `io.attach(wsServer, …)` so engine.io only listens on port 3004.
 */
const io = new Server({
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const wsServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Engine.io intercepts everything on this port. This fallback only runs
  // if engine.io declines the request — which shouldn't happen with
  // `path: '/'`, but we keep a friendly banner just in case.
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      service: 'matlit-realtime',
      wsPort: 3004,
      hint: 'Use Socket.io to connect. HTTP /emit endpoint is on port 3005.',
    }),
  )
})
io.attach(wsServer, { path: '/' })

function joinRoom(socket: Socket, room: string): void {
  if (!room || typeof room !== 'string') return
  // Restrict to a known prefix so a misbehaving client can't join arbitrary
  // private-looking rooms. (This is a public demo service anyway, but the
  // pattern is good hygiene.)
  if (!/^(material|paper):.+$/.test(room)) return
  socket.join(room)
}

io.on('connection', (socket: Socket) => {
  
  console.log(`[realtime] Client connected: ${socket.id}`)

  // Tell the client they're live — useful for the "Connected" indicator.
  socket.emit('realtime:hello', {
    connected: true,
    at: Date.now(),
    clients: io.engine.clientsCount,
  })

  socket.on('subscribe', (payload: SubscribePayload) => {
    if (payload && typeof payload.room === 'string') {
      joinRoom(socket, payload.room)
    }
  })

  // Back-compat: older clients may send `subscribe:room` with a string room.
  socket.on('subscribe:room', (room: unknown) => {
    if (typeof room === 'string') joinRoom(socket, room)
  })

  socket.on('unsubscribe', (room: unknown) => {
    if (typeof room === 'string' && room) socket.leave(room)
  })

  socket.on('disconnect', (reason: string) => {
    
    console.log(`[realtime] Client disconnected: ${socket.id} (${reason})`)
  })

  socket.on('error', (err: unknown) => {
    
    console.error(`[realtime] Socket error (${socket.id}):`, err)
  })
})

const WS_PORT = 3004
const HTTP_PORT = 3005

emitServer.listen(HTTP_PORT, () => {
  
  console.log(`[realtime] HTTP /emit endpoint running on port ${HTTP_PORT}`)
})

wsServer.listen(WS_PORT, () => {
  
  console.log(`[realtime] WebSocket service running on port ${WS_PORT}`)
})

process.on('SIGTERM', () => {
  emitServer.close(() => wsServer.close(() => process.exit(0)))
})
process.on('SIGINT', () => {
  emitServer.close(() => wsServer.close(() => process.exit(0)))
})
