// Giao thức JSON Lines giữa helper native và app chính (mục 3 design.md).
// Dùng chung cho cả Windows và macOS helper.

export interface CameraApp {
  /** Định danh ổn định: đường dẫn exe (win) hoặc bundle id / package family name. */
  id: string
  /** Tên thân thiện để hiển thị. */
  name: string
  /** Thời điểm bắt đầu dùng camera, ISO-8601 UTC. */
  since: string
}

export interface ReadyEvent {
  type: 'ready'
  platform: NodeJS.Platform | string
  version: string
}

export interface StateEvent {
  type: 'state'
  inUse: boolean
  apps: CameraApp[]
  devices: string[]
}

export interface ErrorEvent {
  type: 'error'
  code: string
  message: string
}

export interface HeartbeatEvent {
  type: 'heartbeat'
}

export interface AudioEvent {
  type: 'audio'
  muted: boolean
  /** 0..1 */
  volume: number
}

export type HelperEvent =
  | ReadyEvent
  | StateEvent
  | ErrorEvent
  | HeartbeatEvent
  | AudioEvent

export type HelperCommand =
  | { cmd: 'rescan' }
  | { cmd: 'quit' }
  | { cmd: 'setForceVolume'; enabled: boolean; volume: number }

/** Parse một dòng JSON Lines thành HelperEvent, trả null nếu không hợp lệ. */
export function parseHelperLine(line: string): HelperEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const t = (obj as { type?: unknown }).type
  if (typeof t !== 'string') return null
  switch (t) {
    case 'ready':
    case 'heartbeat':
    case 'error':
    case 'audio':
      return obj as HelperEvent
    case 'state': {
      const e = obj as Partial<StateEvent>
      return {
        type: 'state',
        inUse: Boolean(e.inUse),
        apps: Array.isArray(e.apps) ? (e.apps as CameraApp[]) : [],
        devices: Array.isArray(e.devices) ? (e.devices as string[]) : []
      }
    }
    default:
      return null
  }
}
