import Store from 'electron-store'
import type { Settings } from '../renderer/shared/types'

const DEFAULTS: Settings = {
  launchAtLogin: true,
  alarmEnabled: true,
  alarmSound: 'siren',
  alarmVolume: 1.0,
  alarmMaxSeconds: 120,
  forceSystemVolume: false,
  autoCloseSeconds: 3,
  whitelist: [],
  firstRunDone: false,
  loginItemMigrated: false
}

export class SettingsStore {
  private store: Store<Settings>

  constructor() {
    this.store = new Store<Settings>({
      name: 'settings',
      defaults: DEFAULTS
    })
  }

  getAll(): Settings {
    return { ...DEFAULTS, ...(this.store.store as Partial<Settings>) }
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.store.get(key, DEFAULTS[key]) as Settings[K]
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.store.set(key, value)
  }

  update(patch: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) this.store.set(k, v as never)
    }
    return this.getAll()
  }

  addToWhitelist(id: string): void {
    const wl = new Set(this.get('whitelist'))
    wl.add(id)
    this.set('whitelist', [...wl])
  }

  removeFromWhitelist(id: string): void {
    this.set(
      'whitelist',
      this.get('whitelist').filter((x) => x !== id)
    )
  }
}

export const defaultSettings = DEFAULTS
