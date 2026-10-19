import { Tray, Menu, nativeImage, app, dialog } from 'electron'
import { iconPath } from './windowUtils'

export type TrayState = 'normal' | 'active' | 'paused'

export interface TrayCallbacks {
  onPause: (minutes: number | 'until') => void
  onResume: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

export class TrayController {
  private tray: Tray | null = null
  private state: TrayState = 'normal'
  private statusText = 'Camera đang tắt'
  private audioWarning = false
  private pausedUntilText = ''

  constructor(private cb: TrayCallbacks) {}

  init(): void {
    const img = this.iconFor('normal')
    this.tray = new Tray(img)
    this.tray.setToolTip('CamGuard — Camera đang tắt')
    this.rebuild()
  }

  private iconFor(state: TrayState) {
    const file =
      state === 'active'
        ? 'tray-active.png'
        : state === 'paused'
          ? 'tray-paused.png'
          : 'tray-normal.png'
    const img = nativeImage.createFromPath(iconPath(file))
    if (process.platform === 'darwin') {
      img.setTemplateImage(state === 'normal')
    }
    return img.isEmpty() ? nativeImage.createEmpty() : img
  }

  setState(state: TrayState, statusText: string): void {
    this.state = state
    this.statusText = statusText
    if (this.tray) {
      this.tray.setImage(this.iconFor(state))
      const warn = this.audioWarning
        ? ' ⚠ Âm thanh hệ thống đang tắt — có thể không nghe được chuông'
        : ''
      this.tray.setToolTip(`CamGuard — ${statusText}${warn}`)
    }
    this.rebuild()
  }

  setAudioWarning(on: boolean): void {
    this.audioWarning = on
    this.setState(this.state, this.statusText)
  }

  setPausedUntil(text: string): void {
    this.pausedUntilText = text
    this.rebuild()
  }

  private rebuild(): void {
    if (!this.tray) return
    const isPaused = this.state === 'paused'
    const statusLabel = isPaused
      ? `⏸ Đang tạm dừng${this.pausedUntilText ? ` (${this.pausedUntilText})` : ''}`
      : this.state === 'active'
        ? `🔴 ${this.statusText}`
        : `🟢 ${this.statusText}`

    const audioLabel = this.audioWarning
      ? '⚠ Âm thanh hệ thống đang tắt — có thể không nghe được chuông'
      : null

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: statusLabel, enabled: false },
      ...(audioLabel ? [{ label: audioLabel, enabled: false }] : []),
      { type: 'separator' },
      isPaused
        ? { label: '▶ Tiếp tục giám sát', click: () => this.cb.onResume() }
        : {
            label: 'Tạm dừng giám sát',
            submenu: [
              { label: '15 phút', click: () => this.cb.onPause(15) },
              { label: '1 giờ', click: () => this.cb.onPause(60) },
              { label: 'Cho đến khi bật lại', click: () => this.cb.onPause('until') }
            ]
          },
      { label: 'Lịch sử…', click: () => this.cb.onOpenHistory() },
      { label: 'Cài đặt…', click: () => this.cb.onOpenSettings() },
      { type: 'separator' },
      { label: `Giới thiệu (phiên bản ${app.getVersion()})`, click: () => this.showAbout() },
      { label: 'Thoát CamGuard', click: () => this.cb.onQuit() }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  private showAbout(): void {
    dialog.showMessageBox({
      type: 'info',
      title: 'Giới thiệu CamGuard',
      message: `CamGuard ${app.getVersion()}`,
      detail:
        'App theo dõi camera: cảnh báo khi có ứng dụng sử dụng camera của máy.\n\n' +
        'Lưu ý: chuông báo phát ra thiết bị âm thanh mặc định (kể cả tai nghe Bluetooth). ' +
        'Nếu máy đang tắt tiếng, bạn có thể không nghe được chuông.',
      buttons: ['Đóng']
    })
  }

  dispose(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
