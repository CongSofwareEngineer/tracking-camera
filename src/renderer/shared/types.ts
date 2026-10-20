// Type dùng chung cho các renderer (alert/history/settings) và preload bridge.

export interface Settings {
  launchAtLogin: boolean
  alarmEnabled: boolean
  alarmSound: string // 'siren' | 'bell' | 'beep' | đường dẫn file riêng
  alarmVolume: number // 0..1
  alarmMaxSeconds: number // 0 = kêu đến khi bấm tắt
  forceSystemVolume: boolean
  autoCloseSeconds: number // 0 = không tự đóng
  whitelist: string[]
  firstRunDone: boolean
  /** Đã reset launchAtLogin bị bản cũ ghi sai thành false (chạy 1 lần). */
  loginItemMigrated: boolean
}

export interface AppInfo {
  id: string
  name: string
  since: string // ISO
}

export type AlertMode = 'active' | 'closed'

export interface AlertPayload {
  mode: AlertMode
  apps: AppInfo[]
  devices: string[]
  /** Có whitelist hay không để nút "Bỏ qua app này" biết. */
  monitoringPaused: boolean
  settings: Pick<Settings, 'alarmEnabled' | 'alarmSound' | 'alarmVolume' | 'alarmMaxSeconds' | 'autoCloseSeconds'>
  /** đường dẫn file âm thanh đã giải quyết (absolute hoặc built-in id) */
  resolvedSoundUrl: string
}

export interface HistoryRecord {
  appId: string
  appName: string
  device: string
  start: string
  end: string | null
  durationSec: number | null
}

export interface BuiltinSound {
  id: string
  label: string
  url: string
}

export interface AppMeta {
  version: string
  platform: string
}
