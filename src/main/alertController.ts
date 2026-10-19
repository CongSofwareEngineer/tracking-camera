import { BrowserWindow, screen, app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log/main'
import type { AlertPayload, AppInfo, Settings } from '../renderer/shared/types'
import { rendererUrl, preloadPath } from './windowUtils'

const WIDTH = 560
const HEIGHT = 340

export class AlertController {
  private win: BrowserWindow | null = null
  private ready = false
  private pendingPayload: AlertPayload | null = null

  constructor(private getSettings: () => Settings) {}

  /** Tạo sẵn cửa sổ ẩn để popup hiện tức thì (pre-warm). */
  prewarm(): void {
    if (this.win) return
    this.win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: false,
      backgroundColor: '#1a1414',
      hasShadow: true,
      focusable: true,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    this.win.on('closed', () => {
      this.win = null
      this.ready = false
    })

    this.win.webContents.on('did-finish-load', () => {
      this.ready = true
      if (this.pendingPayload) {
        this.win?.webContents.send('alert:update', this.pendingPayload)
        this.pendingPayload = null
      }
    })

    const url = rendererUrl('alert')
    if (url.startsWith('http')) this.win.loadURL(url)
    else this.win.loadFile(url)
  }

  private resolveSoundDataUrl(sound: string): string {
    // built-in: siren/bell/beep → resources/sounds/<id>.wav
    const builtinIds = ['siren', 'bell', 'beep']
    let file: string
    if (builtinIds.includes(sound)) {
      file = path.join(this.soundsDir(), `${sound}.wav`)
    } else {
      file = sound // đường dẫn file riêng của người dùng
    }
    try {
      const buf = fs.readFileSync(file)
      const ext = path.extname(file).toLowerCase()
      const mime =
        ext === '.mp3'
          ? 'audio/mpeg'
          : ext === '.m4a'
            ? 'audio/mp4'
            : ext === '.ogg'
              ? 'audio/ogg'
              : 'audio/wav'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (err) {
      log.warn('[alert] không đọc được file âm thanh, dùng siren mặc định', err)
      try {
        const buf = fs.readFileSync(path.join(this.soundsDir(), 'siren.wav'))
        return `data:audio/wav;base64,${buf.toString('base64')}`
      } catch {
        return ''
      }
    }
  }

  private soundsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'sounds')
      : path.join(app.getAppPath(), 'resources', 'sounds')
  }

  private moveToCursorDisplay(): void {
    if (!this.win) return
    const pt = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(pt)
    const wa = display.workArea
    const x = Math.round(wa.x + (wa.width - WIDTH) / 2)
    const y = Math.round(wa.y + (wa.height - HEIGHT) / 2)
    this.win.setBounds({ x, y, width: WIDTH, height: HEIGHT })
  }

  showActive(apps: AppInfo[], devices: string[]): void {
    this.prewarm()
    const s = this.getSettings()
    const payload: AlertPayload = {
      mode: 'active',
      apps,
      devices,
      monitoringPaused: false,
      settings: {
        alarmEnabled: s.alarmEnabled,
        alarmSound: s.alarmSound,
        alarmVolume: s.alarmVolume,
        alarmMaxSeconds: s.alarmMaxSeconds,
        autoCloseSeconds: s.autoCloseSeconds
      },
      resolvedSoundUrl: s.alarmEnabled ? this.resolveSoundDataUrl(s.alarmSound) : ''
    }

    this.moveToCursorDisplay()
    this.win?.setAlwaysOnTop(true, 'screen-saver')
    this.win?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (this.ready) {
      this.win?.webContents.send('alert:update', payload)
    } else {
      this.pendingPayload = payload
    }
    // showInactive: không cướp focus bàn phím
    this.win?.showInactive()
  }

  showCleared(): void {
    if (!this.win) return
    const s = this.getSettings()
    const payload: AlertPayload = {
      mode: 'closed',
      apps: [],
      devices: [],
      monitoringPaused: false,
      settings: {
        alarmEnabled: s.alarmEnabled,
        alarmSound: s.alarmSound,
        alarmVolume: s.alarmVolume,
        alarmMaxSeconds: s.alarmMaxSeconds,
        autoCloseSeconds: s.autoCloseSeconds
      },
      resolvedSoundUrl: ''
    }
    if (this.ready) this.win.webContents.send('alert:update', payload)
    else this.pendingPayload = payload
    if (!this.win.isVisible()) this.win.showInactive()
  }

  /** Renderer yêu cầu đóng popup (hết autoClose hoặc bấm "Đã biết"). */
  hide(): void {
    this.win?.hide()
  }

  playTestSound(sound: string): string {
    return this.resolveSoundDataUrl(sound)
  }

  dispose(): void {
    if (this.win) {
      this.win.destroy()
      this.win = null
    }
  }
}
