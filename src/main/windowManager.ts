import { BrowserWindow } from 'electron'
import { rendererUrl, preloadPath, iconPath, type RendererPage } from './windowUtils'

export class WindowManager {
  private windows = new Map<RendererPage, BrowserWindow>()

  open(page: 'history' | 'settings'): void {
    const existing = this.windows.get(page)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return
    }

    const win = new BrowserWindow({
      width: page === 'settings' ? 560 : 760,
      height: page === 'settings' ? 640 : 560,
      show: false,
      title: page === 'settings' ? 'CamGuard — Cài đặt' : 'CamGuard — Lịch sử',
      icon: process.platform === 'win32' ? iconPath('app.ico') : undefined,
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    win.setMenuBarVisibility(false)
    win.once('ready-to-show', () => win.show())
    win.on('closed', () => this.windows.delete(page))

    const url = rendererUrl(page)
    if (url.startsWith('http')) win.loadURL(url)
    else win.loadFile(url)

    this.windows.set(page, win)
  }

  /** Thông báo cho các cửa sổ mở biết settings/history đã đổi. */
  broadcast(channel: string, payload: unknown): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  dispose(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.windows.clear()
  }
}
