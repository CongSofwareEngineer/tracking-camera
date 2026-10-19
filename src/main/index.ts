import { app, ipcMain, dialog, Notification } from 'electron'
import log from 'electron-log/main'
import { SettingsStore } from './settingsStore'
import { HistoryStore } from './historyStore'
import { CameraStateStore } from './cameraStateStore'
import { HelperManager } from './helperManager'
import { AlertController } from './alertController'
import { TrayController } from './trayController'
import { WindowManager } from './windowManager'
import type { HelperEvent } from './protocol'
import type { AppInfo, Settings } from '../renderer/shared/types'

log.initialize?.()
log.transports.file.level = 'info'

// ---------- Single instance ----------
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// macOS: agent app, không icon Dock
if (process.platform === 'darwin') {
  app.dock?.hide()
}

let settings: SettingsStore
let history: HistoryStore
let cameraStore: CameraStateStore
let helper: HelperManager
let alert: AlertController
let tray: TrayController
let windows: WindowManager

// ---------- Pause state ----------
interface PauseState {
  paused: boolean
  until: number | null // epoch ms, null = cho đến khi bật lại
  timer: ReturnType<typeof setTimeout> | null
}
const pause: PauseState = { paused: false, until: null, timer: null }

function isPaused(): boolean {
  return pause.paused
}

function pauseMonitoring(minutes: number | 'until'): void {
  if (pause.timer) clearTimeout(pause.timer)
  pause.paused = true
  if (minutes === 'until') {
    pause.until = null
    pause.timer = null
    tray.setPausedUntil('đến khi bật lại')
  } else {
    pause.until = Date.now() + minutes * 60_000
    pause.timer = setTimeout(() => resumeMonitoring(), minutes * 60_000)
    const t = new Date(pause.until)
    tray.setPausedUntil(`đến ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`)
  }
  // ẩn popup + dừng chuông ngay
  alert.hide()
  updateTray()
}

function resumeMonitoring(): void {
  if (pause.timer) clearTimeout(pause.timer)
  pause.paused = false
  pause.until = null
  pause.timer = null
  updateTray()
  cameraStore.reevaluate()
}

// ---------- Tray state ----------
function updateTray(): void {
  if (pause.paused) {
    tray.setState('paused', 'Đang tạm dừng giám sát')
    return
  }
  const apps = cameraStore.getRawApps()
  if (apps.length > 0) {
    const name = apps.length === 1 ? apps[0].name : `${apps.length} ứng dụng`
    tray.setState('active', `${name} đang dùng camera`)
  } else {
    tray.setState('normal', 'Camera đang tắt')
  }
}

// ---------- Helper events ----------
function onHelperEvent(e: HelperEvent): void {
  switch (e.type) {
    case 'ready':
      log.info('[main] helper ready', e.platform, e.version)
      break
    case 'state':
      cameraStore.applyState(e.apps as AppInfo[], e.devices)
      updateTray()
      break
    case 'audio':
      tray.setAudioWarning(e.muted || e.volume < 0.3)
      break
    case 'error':
      log.warn('[main] helper error', e.code, e.message)
      break
    case 'heartbeat':
      break
  }
}

// ---------- First run ----------
function handleFirstRun(): void {
  if (settings.get('firstRunDone')) return
  settings.set('firstRunDone', true)
  // bật khởi động cùng máy mặc định
  applyLoginItem(settings.get('launchAtLogin'))
  if (Notification.isSupported()) {
    new Notification({
      title: 'CamGuard đang chạy',
      body: 'CamGuard đang chạy ở khay hệ thống và sẽ cảnh báo khi có app dùng camera.'
    }).show()
  }
}

function applyLoginItem(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ['--hidden']
    })
  } catch (err) {
    log.warn('[main] setLoginItemSettings lỗi', err)
  }
}

function syncLoginItemToSettings(): void {
  try {
    const li = app.getLoginItemSettings()
    if (li.openAtLogin !== settings.get('launchAtLogin')) {
      settings.set('launchAtLogin', li.openAtLogin)
    }
  } catch {
    /* ignore */
  }
}

// ---------- IPC ----------
function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings.getAll())

  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const before = settings.getAll()
    const after = settings.update(patch)
    if (patch.launchAtLogin !== undefined && patch.launchAtLogin !== before.launchAtLogin) {
      applyLoginItem(after.launchAtLogin)
    }
    if (patch.whitelist !== undefined) {
      cameraStore.reevaluate()
      updateTray()
    }
    if (patch.forceSystemVolume !== undefined) {
      helper.send({
        cmd: 'setForceVolume',
        enabled: after.forceSystemVolume,
        volume: after.alarmVolume
      })
    }
    windows.broadcast('settings:changed', after)
    return after
  })

  ipcMain.handle('history:get', async () => {
    await history.load()
    return history.getAll()
  })

  ipcMain.handle('history:clear', () => {
    history.clear()
    windows.broadcast('history:changed', history.getAll())
    return true
  })

  ipcMain.handle('meta:get', () => ({
    version: app.getVersion(),
    platform: process.platform
  }))

  ipcMain.handle('sound:test', (_e, sound: string) => alert.playTestSound(sound))

  ipcMain.handle('sound:pickFile', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Chọn file nhạc báo động',
      properties: ['openFile'],
      filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return r.filePaths[0]
  })

  // Alert popup actions
  ipcMain.on('alert:acknowledge', () => {
    cameraStore.acknowledgeCurrent()
    alert.hide()
  })

  ipcMain.on('alert:requestClose', () => {
    alert.hide()
  })

  ipcMain.on('alert:whitelist', (_e, appId: string) => {
    settings.addToWhitelist(appId)
    windows.broadcast('settings:changed', settings.getAll())
    cameraStore.reevaluate()
    updateTray()
    alert.hide()
  })

  // Menu actions từ renderer (nếu cần)
  ipcMain.on('window:openSettings', () => windows.open('settings'))
  ipcMain.on('window:openHistory', () => windows.open('history'))
}

// ---------- Boot ----------
function boot(): void {
  settings = new SettingsStore()
  history = new HistoryStore()
  alert = new AlertController(() => settings.getAll())
  windows = new WindowManager()

  cameraStore = new CameraStateStore(
    {
      historyStart: (appInfo, device) => {
        void history.load().then(() =>
          history.startSession(appInfo.id, appInfo.name, device, appInfo.since || new Date().toISOString())
        )
        windows.broadcast('history:changed', history.getAll())
      },
      historyEnd: (appId, endIso) => {
        history.endSession(appId, endIso)
        windows.broadcast('history:changed', history.getAll())
      },
      showAlert: (apps, devices) => {
        if (!isPaused()) alert.showActive(apps, devices)
      },
      clearAlert: () => {
        history.endAllOpen(new Date().toISOString())
        alert.showCleared()
        windows.broadcast('history:changed', history.getAll())
      },
      rawStateChanged: () => {
        updateTray()
      }
    },
    {
      isPaused,
      getWhitelist: () => settings.get('whitelist'),
      offDebounceMs: 1000
    }
  )

  tray = new TrayController({
    onPause: (m) => pauseMonitoring(m),
    onResume: () => resumeMonitoring(),
    onOpenHistory: () => windows.open('history'),
    onOpenSettings: () => windows.open('settings'),
    onQuit: () => quit()
  })

  helper = new HelperManager()
  helper.on('event', onHelperEvent)
  helper.on('statusChanged', (alive) => log.info('[main] helper', alive ? 'sống' : 'chết'))
  helper.on('fatal', (msg) => {
    log.error('[main] helper fatal', msg)
    tray.setState('normal', 'Lỗi helper — ' + msg)
  })

  tray.init()
  registerIpc()
  alert.prewarm()
  void history.load()

  handleFirstRun()
  syncLoginItemToSettings()

  helper.start()

  // kiểm tra âm lượng định kỳ (yêu cầu helper rescan audio nếu hỗ trợ)
  setInterval(() => helper.send({ cmd: 'rescan' }), 10 * 60_000)
}

let quitting = false
async function quit(): Promise<void> {
  if (quitting) return
  quitting = true
  try {
    await helper.stop()
  } catch {
    /* ignore */
  }
  cameraStore?.dispose()
  alert?.dispose()
  tray?.dispose()
  windows?.dispose()
  app.exit(0)
}

// Instance thứ hai → mở Cài đặt của instance đang chạy
app.on('second-instance', () => {
  windows?.open('settings')
})

app.on('window-all-closed', () => {
  // app chạy ngầm: đăng ký listener rỗng để KHÔNG tự thoát khi đóng hết cửa sổ.
})

if (gotLock) {
  app.whenReady().then(() => {
    // app id cho Windows notification
    if (process.platform === 'win32') app.setAppUserModelId('com.camguard.app')
    boot()
  })
}
