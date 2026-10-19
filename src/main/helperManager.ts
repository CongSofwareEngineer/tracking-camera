import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import log from 'electron-log/main'
import { EventEmitter } from 'events'
import { parseHelperLine, type HelperEvent, type HelperCommand } from './protocol'

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]
const HEARTBEAT_TIMEOUT_MS = 90_000
const MAX_CONSECUTIVE_FAILURES = 5

export interface HelperManagerEvents {
  event: (e: HelperEvent) => void
  /** Helper lỗi liên tục quá số lần cho phép. */
  fatal: (message: string) => void
  /** Helper sống lại / chết — để tray biết. */
  statusChanged: (alive: boolean) => void
}

// Gộp khai báo để EventEmitter có kiểu sự kiện chặt chẽ — mẫu quen thuộc, an toàn ở đây.
/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
export declare interface HelperManager {
  on<E extends keyof HelperManagerEvents>(event: E, listener: HelperManagerEvents[E]): this
  emit<E extends keyof HelperManagerEvents>(event: E, ...args: Parameters<HelperManagerEvents[E]>): boolean
}
export class HelperManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private restartCount = 0
  private consecutiveFailures = 0
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private stopping = false

  getHelperPath(): string {
    const platform = process.platform
    const exeName =
      platform === 'win32' ? 'camguard-helper-win.exe' : 'camguard-helper-mac'

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'helper', exeName)
    }
    // dev: lấy từ helpers/<platform>/bin
    const dir = platform === 'win32' ? 'win' : 'mac'
    return path.join(app.getAppPath(), 'helpers', dir, 'bin', exeName)
  }

  start(): void {
    this.stopping = false
    this.spawnHelper()
  }

  private spawnHelper(): void {
    const helperPath = this.getHelperPath()
    if (!fs.existsSync(helperPath)) {
      log.error('[helper] không tìm thấy binary:', helperPath)
      this.emit('fatal', `Không tìm thấy helper: ${helperPath}`)
      return
    }

    log.info('[helper] spawn', helperPath)
    try {
      this.child = spawn(helperPath, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as ChildProcessWithoutNullStreams
    } catch (err) {
      log.error('[helper] spawn lỗi', err)
      this.scheduleRestart()
      return
    }

    this.emit('statusChanged', true)

    const rl = readline.createInterface({ input: this.child.stdout })
    rl.on('line', (line) => {
      const ev = parseHelperLine(line)
      if (!ev) {
        if (line.trim()) log.warn('[helper] dòng không parse được:', line)
        return
      }
      if (ev.type === 'heartbeat' || ev.type === 'ready') {
        this.resetHeartbeat()
      }
      if (ev.type === 'ready') {
        this.consecutiveFailures = 0
        this.restartCount = 0
      }
      this.emit('event', ev)
    })

    const rlErr = readline.createInterface({ input: this.child.stderr })
    rlErr.on('line', (line) => {
      if (line.trim()) log.info('[helper:stderr]', line)
    })

    this.child.on('exit', (code, signal) => {
      log.warn(`[helper] thoát code=${code} signal=${signal}`)
      this.emit('statusChanged', false)
      this.clearHeartbeat()
      this.child = null
      if (!this.stopping) {
        this.consecutiveFailures++
        this.scheduleRestart()
      }
    })

    this.child.on('error', (err) => {
      log.error('[helper] lỗi tiến trình', err)
    })

    this.resetHeartbeat()
  }

  private scheduleRestart(): void {
    if (this.stopping) return
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log.error('[helper] thất bại liên tục quá nhiều lần')
      this.emit('fatal', 'Helper giám sát camera không khởi động được. Hãy mở lại CamGuard.')
      return
    }
    const delay = BACKOFF_MS[Math.min(this.restartCount, BACKOFF_MS.length - 1)]
    this.restartCount++
    log.info(`[helper] khởi động lại sau ${delay}ms (lần ${this.restartCount})`)
    this.restartTimer = setTimeout(() => this.spawnHelper(), delay)
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeatTimer = setTimeout(() => {
      log.warn('[helper] quá 90s không có heartbeat → kill & restart')
      this.killChild()
    }, HEARTBEAT_TIMEOUT_MS)
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  send(cmd: HelperCommand): void {
    if (this.child && this.child.stdin.writable) {
      try {
        this.child.stdin.write(JSON.stringify(cmd) + '\n')
      } catch (err) {
        log.warn('[helper] gửi lệnh lỗi', err)
      }
    }
  }

  rescan(): void {
    this.send({ cmd: 'rescan' })
  }

  private killChild(): void {
    if (this.child) {
      try {
        this.child.kill()
      } catch {
        /* ignore */
      }
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.clearHeartbeat()
    if (!this.child) return
    this.send({ cmd: 'quit' })
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.killChild()
        resolve()
      }, 1000)
      this.child?.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
    this.child = null
  }
}
