import { describe, it, expect } from 'vitest'
import { parseHelperLine } from '../src/main/protocol'

describe('parseHelperLine', () => {
  it('parse ready', () => {
    const e = parseHelperLine('{"type":"ready","platform":"win32","version":"1.0.0"}')
    expect(e?.type).toBe('ready')
  })

  it('parse state đầy đủ', () => {
    const e = parseHelperLine(
      '{"type":"state","inUse":true,"apps":[{"id":"a","name":"A","since":"x"}],"devices":["Cam"]}'
    )
    expect(e).toEqual({
      type: 'state',
      inUse: true,
      apps: [{ id: 'a', name: 'A', since: 'x' }],
      devices: ['Cam']
    })
  })

  it('state thiếu field → mặc định an toàn', () => {
    const e = parseHelperLine('{"type":"state","inUse":true}')
    expect(e).toEqual({ type: 'state', inUse: true, apps: [], devices: [] })
  })

  it('parse heartbeat / audio / error', () => {
    expect(parseHelperLine('{"type":"heartbeat"}')?.type).toBe('heartbeat')
    expect(parseHelperLine('{"type":"audio","muted":true,"volume":0.1}')?.type).toBe('audio')
    expect(parseHelperLine('{"type":"error","code":"X","message":"m"}')?.type).toBe('error')
  })

  it('dòng rác / rỗng / sai JSON → null', () => {
    expect(parseHelperLine('')).toBeNull()
    expect(parseHelperLine('   ')).toBeNull()
    expect(parseHelperLine('not json')).toBeNull()
    expect(parseHelperLine('{"no":"type"}')).toBeNull()
    expect(parseHelperLine('{"type":"unknown"}')).toBeNull()
  })
})
