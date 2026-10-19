import type { CamGuardApi } from './index'

declare global {
  interface Window {
    camguard: CamGuardApi
  }
}

export {}
