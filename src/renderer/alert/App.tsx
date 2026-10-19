import { useEffect, useRef, useState, useCallback } from 'react'
import type { AlertPayload } from '../shared/types'
import { t, formatTime } from '../shared/i18n'

export function AlertApp(): JSX.Element {
  const [payload, setPayload] = useState<AlertPayload | null>(null)
  const [alarmOn, setAlarmOn] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alarmMaxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopAlarm = useCallback(() => {
    setAlarmOn(false)
    const a = audioRef.current
    if (a) {
      a.pause()
      a.currentTime = 0
    }
    if (alarmMaxTimer.current) {
      clearTimeout(alarmMaxTimer.current)
      alarmMaxTimer.current = null
    }
  }, [])

  const startAlarm = useCallback((url: string, volume: number, maxSeconds: number) => {
    if (!url) return
    let a = audioRef.current
    if (!a) {
      a = new Audio()
      a.loop = true
      audioRef.current = a
    }
    a.src = url
    a.loop = true
    a.volume = Math.max(0, Math.min(1, volume))
    setAlarmOn(true)
    void a.play().catch(() => {
      /* autoplay policy đã tắt nên hiếm khi lỗi */
    })
    if (alarmMaxTimer.current) clearTimeout(alarmMaxTimer.current)
    if (maxSeconds > 0) {
      alarmMaxTimer.current = setTimeout(() => stopAlarm(), maxSeconds * 1000)
    }
  }, [stopAlarm])

  useEffect(() => {
    const off = window.camguard.onAlertUpdate((p) => {
      setPayload(p)

      // clear timers khi có update mới
      if (autoCloseTimer.current) {
        clearTimeout(autoCloseTimer.current)
        autoCloseTimer.current = null
      }

      if (p.mode === 'active') {
        if (p.settings.alarmEnabled && p.resolvedSoundUrl) {
          startAlarm(p.resolvedSoundUrl, p.settings.alarmVolume, p.settings.alarmMaxSeconds)
        }
      } else {
        // closed → tắt chuông, tự đóng sau autoCloseSeconds
        stopAlarm()
        const secs = p.settings.autoCloseSeconds
        if (secs > 0) {
          autoCloseTimer.current = setTimeout(() => {
            window.camguard.requestCloseAlert()
          }, secs * 1000)
        }
      }
    })
    return () => {
      off()
      stopAlarm()
    }
  }, [startAlarm, stopAlarm])

  const onAck = () => {
    stopAlarm()
    window.camguard.acknowledgeAlert()
  }

  const onWhitelist = () => {
    if (!payload || payload.apps.length === 0) return
    if (confirm(t('alert.whitelist.confirm'))) {
      // bỏ qua tất cả app đang hiện (thường là 1)
      for (const a of payload.apps) window.camguard.whitelistApp(a.id)
      stopAlarm()
    }
  }

  if (!payload) return <div className="loading" />

  const closed = payload.mode === 'closed'

  return (
    <div className={`alert ${closed ? 'closed' : 'active'}`}>
      <div className="top">
        <div className={`cam-icon ${closed ? '' : 'blink'}`}>{closed ? '🎥' : '🔴'}</div>
        <div className="title">{closed ? t('alert.closed.title') : t('alert.title')}</div>
      </div>

      <div className="body">
        {closed ? (
          <div className="desc">{t('alert.closed.desc')}</div>
        ) : payload.apps.length === 0 ? (
          <div className="main-line">{t('alert.oneAppUsing')}</div>
        ) : (
          <div className="app-list">
            {payload.apps.map((a) => (
              <div className="app-row" key={a.id}>
                <span className="app-name">{a.name}</span>{' '}
                <span className="app-sub">{t('alert.usingCamera')}</span>
                <div className="app-meta">
                  {t('alert.startedAt')} {formatTime(a.since)}
                  {payload.devices.length > 0 && ` · ${payload.devices.join(', ')}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!closed && (
        <div className="buttons">
          <button className="btn primary" onClick={onAck}>
            {t('alert.btn.ack')}
          </button>
          {alarmOn && (
            <button className="btn" onClick={stopAlarm}>
              {t('alert.btn.stopAlarm')}
            </button>
          )}
          {payload.apps.length > 0 && (
            <button className="btn ghost" onClick={onWhitelist}>
              {t('alert.btn.whitelist')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
