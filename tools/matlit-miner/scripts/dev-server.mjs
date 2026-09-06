// Dev-server launcher: runs `next dev` and tees its output into dev.log.
//
// Why this file exists instead of a plain `| tee dev.log` in package.json.
//
// The `dev` script used to be:
//
//   "dev": "next dev -p 3000 2>&1 | tee dev.log"
//
// Two problems with it on Windows:
//
//   1. `tee.exe` only exists as part of Git for Windows
//      (C:\Program Files\Git\usr\bin), which is not on PATH unless Git was
//      installed with the usr/bin directory added. `bun run dev` then died
//      outright with `bun: command not found: tee`.
//
//   2. More damaging: bun's script executor does not carry data through
//      pipes on Windows. The pipeline's right-hand side runs, but its stdin
//      stays empty. Replacing `tee` with an inline `node -e "..."` tee, or
//      with a helper script, made `dev.log` get created at 0 bytes while the
//      same command piped directly from a shell logged ~10KB. So under bun the
//      pipe is dead regardless of what sits on either side of it -- meaning
//      dev.log was never actually being written by any piped variant.
//
// Doing the tee inside Node with child_process.spawn sidesteps the shell pipe
// entirely, so the wiring is the same on every platform. src/lib/logger.ts
// and src/lib/error-reporter.ts write to the console and document dev.log as
// the sink, so keeping the file real matters.

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

const log = createWriteStream('dev.log', { flags: 'w' })

const child = spawn('next dev -p 3000', {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
})

child.stdout.pipe(process.stdout)
child.stdout.pipe(log)
child.stderr.pipe(process.stderr)
child.stderr.pipe(log)

child.on('close', (code) => {
  log.end()
  process.exit(code === null ? 0 : code)
})

// If the log file cannot be written (locked, disk full) the pipes would stall
// and the dev server would hang mid-startup. Swallow the write error instead,
// so a logging failure degrades to console-only output rather than freezing
// the app.
log.on('error', () => {})
