import { contextBridge, ipcRenderer } from 'electron'
import type {
  Settings,
  HistoryRecord,
  AlertPayload,
  AppMeta
} from '../renderer/shared/types'

const api = {
  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged: (cb: (s: Settings) => void) => {
    const h = (_e: unknown, s: Settings) => cb(s)
    ipcRenderer.on('settings:changed', h)
    return () => {
      ipcRenderer.removeListener('settings:changed', h)
    }
  },

  // History
  getHistory: (): Promise<HistoryRecord[]> => ipcRenderer.invoke('history:get'),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('history:clear'),
  onHistoryChanged: (cb: (h: HistoryRecord[]) => void) => {
    const handler = (_e: unknown, h: HistoryRecord[]) => cb(h)
    ipcRenderer.on('history:changed', handler)
    return () => {
      ipcRenderer.removeListener('history:changed', handler)
    }
  },

  // Meta
  getMeta: (): Promise<AppMeta> => ipcRenderer.invoke('meta:get'),

  // Sound
  testSound: (sound: string): Promise<string> => ipcRenderer.invoke('sound:test', sound),
  pickSoundFile: (): Promise<string | null> => ipcRenderer.invoke('sound:pickFile'),

  // Alert popup
  onAlertUpdate: (cb: (p: AlertPayload) => void) => {
    const h = (_e: unknown, p: AlertPayload) => cb(p)
    ipcRenderer.on('alert:update', h)
    return () => {
      ipcRenderer.removeListener('alert:update', h)
    }
  },
  acknowledgeAlert: () => ipcRenderer.send('alert:acknowledge'),
  requestCloseAlert: () => ipcRenderer.send('alert:requestClose'),
  whitelistApp: (appId: string) => ipcRenderer.send('alert:whitelist', appId),

  // Windows
  openSettings: () => ipcRenderer.send('window:openSettings'),
  openHistory: () => ipcRenderer.send('window:openHistory')
}

contextBridge.exposeInMainWorld('camguard', api)

export type CamGuardApi = typeof api
