import type { AppInfo } from '../renderer/shared/types'

export interface CameraStoreEvents {
  /** Một app bắt đầu dùng camera (ghi lịch sử — không phụ thuộc whitelist/tạm dừng). */
  historyStart(app: AppInfo, device: string): void
  /** Một app ngừng dùng camera. */
  historyEnd(appId: string, endIso: string): void
  /** Nên hiện/cập nhật popup đang hoạt động (đã lọc whitelist, không ở trạng thái tạm dừng). */
  showAlert(apps: AppInfo[], devices: string[]): void
  /** Camera đã tắt (sau debounce) → popup chuyển trạng thái "đã tắt". */
  clearAlert(): void
  /** Trạng thái thô thay đổi — để cập nhật tray/tooltip bất kể popup. */
  rawStateChanged(inUse: boolean, apps: AppInfo[], devices: string[]): void
}

export interface CameraStoreOptions {
  isPaused: () => boolean
  getWhitelist: () => string[]
  offDebounceMs?: number
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (h: ReturnType<typeof setTimeout>) => void
}

const sameIds = (a: AppInfo[], b: AppInfo[]): boolean => {
  if (a.length !== b.length) return false
  const sa = new Set(a.map((x) => x.id))
  return b.every((x) => sa.has(x.id))
}

export class CameraStateStore {
  private opts: Required<CameraStoreOptions>
  private rawApps = new Map<string, AppInfo>()
  private devices: string[] = []

  /** Các app đang được popup hiển thị (đã lọc whitelist). */
  private displayedApps: AppInfo[] = []
  private alertActive = false
  /** app id mà người dùng đã bấm "Đã biết" — không hiện lại cho đúng tập này. */
  private acknowledged = new Set<string>()
  private offTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private events: CameraStoreEvents,
    options: CameraStoreOptions
  ) {
    this.opts = {
      offDebounceMs: 1000,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h),
      ...options
    }
  }

  /** Nhận state từ helper. */
  applyState(apps: AppInfo[], devices: string[]): void {
    this.devices = devices

    // 1) Lịch sử: so sánh tập thô (không lọc whitelist, không quan tâm tạm dừng).
    const nowIso = new Date(this.opts.now()).toISOString()
    const incoming = new Map(apps.map((a) => [a.id, a]))
    const device = devices[0] ?? ''

    for (const [id, app] of incoming) {
      if (!this.rawApps.has(id)) {
        this.events.historyStart(app, device)
      }
    }
    for (const id of this.rawApps.keys()) {
      if (!incoming.has(id)) {
        this.events.historyEnd(id, nowIso)
      }
    }
    this.rawApps = incoming

    this.events.rawStateChanged(apps.length > 0, apps, devices)

    // 2) Hiển thị popup: lọc whitelist.
    const wl = new Set(this.opts.getWhitelist())
    const filtered = apps.filter((a) => !wl.has(a.id))

    // dọn acknowledged cho các app không còn nữa
    for (const id of [...this.acknowledged]) {
      if (!incoming.has(id)) this.acknowledged.delete(id)
    }

    this.evaluateDisplay(filtered, devices)
  }

  private evaluateDisplay(filtered: AppInfo[], devices: string[]): void {
    if (filtered.length > 0) {
      // Có app (sau lọc) đang dùng camera → huỷ timer tắt.
      if (this.offTimer) {
        this.opts.clearTimer(this.offTimer)
        this.offTimer = null
      }

      if (this.opts.isPaused()) {
        // Tạm dừng: không popup, không chuông. Nhưng vẫn coi là không active.
        this.displayedApps = filtered
        return
      }

      // Có app mới (ngoài tập đã acknowledged) → hiện lại.
      const hasUnacknowledged = filtered.some((a) => !this.acknowledged.has(a.id))
      const changed = !sameIds(filtered, this.displayedApps)

      this.displayedApps = filtered

      if (!this.alertActive && hasUnacknowledged) {
        this.alertActive = true
        this.events.showAlert(filtered, devices)
      } else if (this.alertActive && changed) {
        this.events.showAlert(filtered, devices)
      }
    } else {
      // Không còn app nào (sau lọc).
      this.displayedApps = []
      this.acknowledged.clear()
      if (this.alertActive) {
        // debounce on→off
        if (this.offTimer) this.opts.clearTimer(this.offTimer)
        this.offTimer = this.opts.setTimer(() => {
          this.offTimer = null
          this.alertActive = false
          this.events.clearAlert()
        }, this.opts.offDebounceMs)
      }
    }
  }

  /** Người dùng bấm "Đã biết" trên popup → ghi nhận tập app hiện tại là đã biết. */
  acknowledgeCurrent(): void {
    for (const a of this.displayedApps) this.acknowledged.add(a.id)
    this.alertActive = false
  }

  /** Khi whitelist / trạng thái tạm dừng thay đổi → đánh giá lại ngay. */
  reevaluate(): void {
    const wl = new Set(this.opts.getWhitelist())
    const apps = [...this.rawApps.values()]
    const filtered = apps.filter((a) => !wl.has(a.id))
    if (filtered.length === 0 && this.alertActive) {
      // whitelist khiến không còn app → tắt ngay (không debounce)
      if (this.offTimer) {
        this.opts.clearTimer(this.offTimer)
        this.offTimer = null
      }
      this.displayedApps = []
      this.alertActive = false
      this.events.clearAlert()
      return
    }
    this.evaluateDisplay(filtered, this.devices)
  }

  isCameraInUse(): boolean {
    return this.rawApps.size > 0
  }

  getRawApps(): AppInfo[] {
    return [...this.rawApps.values()]
  }

  getDevices(): string[] {
    return [...this.devices]
  }

  /** Dọn tài nguyên (timer) khi tắt. */
  dispose(): void {
    if (this.offTimer) {
      this.opts.clearTimer(this.offTimer)
      this.offTimer = null
    }
  }
}
