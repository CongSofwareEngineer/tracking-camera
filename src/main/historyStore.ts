import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import log from 'electron-log/main'
import type { HistoryRecord } from '../renderer/shared/types'

const MAX_RECORDS = 200

export class HistoryStore {
  private file: string
  private records: HistoryRecord[] = []
  private loaded = false
  private writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.file = path.join(app.getPath('userData'), 'history.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) this.records = parsed as HistoryRecord[]
    } catch {
      this.records = []
    }
    this.loaded = true
  }

  getAll(): HistoryRecord[] {
    return [...this.records].reverse() // mới nhất lên đầu
  }

  /** Ghi nhận một app bắt đầu dùng camera. */
  startSession(appId: string, appName: string, device: string, start: string): void {
    // tránh trùng: nếu đã có session mở cho appId này thì bỏ qua
    const openIdx = this.records.findIndex((r) => r.appId === appId && r.end === null)
    if (openIdx >= 0) return
    this.records.push({ appId, appName, device, start, end: null, durationSec: null })
    this.trim()
    this.persist()
  }

  /** Đóng session khi app ngừng dùng camera. */
  endSession(appId: string, end: string): void {
    // đóng session mở gần nhất của appId
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i]
      if (r.appId === appId && r.end === null) {
        r.end = end
        const ms = new Date(end).getTime() - new Date(r.start).getTime()
        r.durationSec = Math.max(0, Math.round(ms / 1000))
        this.persist()
        return
      }
    }
  }

  /** Đóng tất cả session còn mở (vd khi camera tắt hẳn). */
  endAllOpen(end: string): void {
    let changed = false
    for (const r of this.records) {
      if (r.end === null) {
        r.end = end
        const ms = new Date(end).getTime() - new Date(r.start).getTime()
        r.durationSec = Math.max(0, Math.round(ms / 1000))
        changed = true
      }
    }
    if (changed) this.persist()
  }

  clear(): void {
    this.records = []
    this.persist()
  }

  private trim(): void {
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(this.records.length - MAX_RECORDS)
    }
  }

  private persist(): void {
    const snapshot = JSON.stringify(this.records, null, 0)
    this.writeQueue = this.writeQueue
      .then(() => fs.writeFile(this.file, snapshot, 'utf-8'))
      .catch((err) => log.error('[history] ghi file lỗi', err))
  }
}
