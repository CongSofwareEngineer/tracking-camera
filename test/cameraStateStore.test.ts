import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CameraStateStore } from '../src/main/cameraStateStore'
import type { AppInfo } from '../src/renderer/shared/types'

function app(id: string, name = id): AppInfo {
  return { id, name, since: '2026-10-19T09:00:00.000Z' }
}

function makeRecorder() {
  return {
    historyStart: vi.fn(),
    historyEnd: vi.fn(),
    showAlert: vi.fn(),
    clearAlert: vi.fn(),
    rawStateChanged: vi.fn()
  }
}

describe('CameraStateStore', () => {
  let paused: boolean
  let whitelist: string[]
  let rec: ReturnType<typeof makeRecorder>
  let store: CameraStateStore

  beforeEach(() => {
    vi.useFakeTimers()
    paused = false
    whitelist = []
    rec = makeRecorder()
    store = new CameraStateStore(rec, {
      isPaused: () => paused,
      getWhitelist: () => whitelist,
      offDebounceMs: 1000
    })
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
  })

  it('off→on: hiện popup ngay lập tức', () => {
    store.applyState([app('chrome')], ['Cam'])
    expect(rec.showAlert).toHaveBeenCalledTimes(1)
    expect(rec.showAlert.mock.calls[0][0]).toHaveLength(1)
  })

  it('whitelist: không hiện popup cho app bị bỏ qua, nhưng vẫn ghi lịch sử', () => {
    whitelist = ['zoom']
    store.applyState([app('zoom')], ['Cam'])
    expect(rec.showAlert).not.toHaveBeenCalled()
    expect(rec.historyStart).toHaveBeenCalledTimes(1)
  })

  it('on→off: clearAlert sau debounce 1s, không sớm hơn', () => {
    store.applyState([app('chrome')], ['Cam'])
    store.applyState([], [])
    expect(rec.clearAlert).not.toHaveBeenCalled()
    vi.advanceTimersByTime(999)
    expect(rec.clearAlert).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(rec.clearAlert).toHaveBeenCalledTimes(1)
  })

  it('off nhấp nháy rồi on lại trong 1s: huỷ clear (không nháy)', () => {
    store.applyState([app('chrome')], ['Cam'])
    store.applyState([], [])
    vi.advanceTimersByTime(500)
    store.applyState([app('chrome')], ['Cam'])
    vi.advanceTimersByTime(1000)
    expect(rec.clearAlert).not.toHaveBeenCalled()
  })

  it('tạm dừng: không hiện popup nhưng vẫn ghi lịch sử', () => {
    paused = true
    store.applyState([app('chrome')], ['Cam'])
    expect(rec.showAlert).not.toHaveBeenCalled()
    expect(rec.historyStart).toHaveBeenCalledTimes(1)
  })

  it('lịch sử: start khi app xuất hiện, end khi biến mất', () => {
    store.applyState([app('chrome')], ['Cam'])
    expect(rec.historyStart).toHaveBeenCalledTimes(1)
    store.applyState([], [])
    expect(rec.historyEnd).toHaveBeenCalledTimes(1)
    expect(rec.historyEnd.mock.calls[0][0]).toBe('chrome')
  })

  it('nhiều app: liệt kê đủ, bớt một thì cập nhật', () => {
    store.applyState([app('chrome'), app('zoom')], ['Cam'])
    expect(rec.showAlert).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'chrome' })]),
      ['Cam']
    )
    store.applyState([app('chrome')], ['Cam'])
    const last = rec.showAlert.mock.calls.at(-1)![0]
    expect(last).toHaveLength(1)
  })

  it('Đã biết rồi app giữ nguyên: không hiện lại; app mới: hiện lại', () => {
    store.applyState([app('chrome')], ['Cam'])
    store.acknowledgeCurrent()
    // cùng app → không show thêm
    store.applyState([app('chrome')], ['Cam'])
    expect(rec.showAlert).toHaveBeenCalledTimes(1)
    // app mới xuất hiện → show lại
    store.applyState([app('chrome'), app('zoom')], ['Cam'])
    expect(rec.showAlert).toHaveBeenCalledTimes(2)
  })

  it('reevaluate khi thêm whitelist lúc đang bật: tắt popup ngay', () => {
    store.applyState([app('zoom')], ['Cam'])
    expect(rec.showAlert).toHaveBeenCalledTimes(1)
    whitelist = ['zoom']
    store.reevaluate()
    expect(rec.clearAlert).toHaveBeenCalledTimes(1)
  })
})
