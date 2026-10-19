import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../shared/types'
import { t } from '../shared/i18n'

const BUILTIN = [
  { id: 'siren', key: 'settings.sound.siren' },
  { id: 'bell', key: 'settings.sound.bell' },
  { id: 'beep', key: 'settings.sound.beep' }
]

export function SettingsApp(): JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  const testAudio = useRef<HTMLAudioElement | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.camguard.getSettings().then(setS)
    const off = window.camguard.onSettingsChanged(setS)
    return off
  }, [])

  const save = async (patch: Partial<Settings>) => {
    const next = await window.camguard.updateSettings(patch)
    setS(next)
    setSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1200)
  }

  const isCustom = (sound: string) => !BUILTIN.some((b) => b.id === sound)

  const onPickFile = async () => {
    const f = await window.camguard.pickSoundFile()
    if (f) void save({ alarmSound: f })
  }

  const onTest = async () => {
    if (!s) return
    const url = await window.camguard.testSound(s.alarmSound)
    if (!url) return
    let a = testAudio.current
    if (!a) {
      a = new Audio()
      testAudio.current = a
    }
    a.src = url
    a.loop = false
    a.volume = s.alarmVolume
    void a.play()
    setTimeout(() => a?.pause(), 4000)
  }

  if (!s) return <div className="page">Đang tải…</div>

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>

      <label className="row">
        <input
          type="checkbox"
          checked={s.launchAtLogin}
          onChange={(e) => save({ launchAtLogin: e.target.checked })}
        />
        <span>{t('settings.launchAtLogin')}</span>
      </label>

      <label className="row">
        <input
          type="checkbox"
          checked={s.alarmEnabled}
          onChange={(e) => save({ alarmEnabled: e.target.checked })}
        />
        <span>{t('settings.alarmEnabled')}</span>
      </label>

      <div className="field">
        <label>{t('settings.alarmSound')}</label>
        <div className="sound-opts">
          {BUILTIN.map((b) => (
            <label key={b.id} className="radio">
              <input
                type="radio"
                name="sound"
                checked={s.alarmSound === b.id}
                onChange={() => save({ alarmSound: b.id })}
              />
              <span>{t(b.key)}</span>
            </label>
          ))}
          <label className="radio">
            <input type="radio" name="sound" checked={isCustom(s.alarmSound)} onChange={onPickFile} />
            <span>{t('settings.sound.custom')}</span>
          </label>
          <button className="btn small" onClick={onTest}>
            ▶ {t('settings.sound.test')}
          </button>
        </div>
        {isCustom(s.alarmSound) && <div className="hint">{s.alarmSound}</div>}
      </div>

      <div className="field">
        <label>
          {t('settings.alarmVolume')}: {Math.round(s.alarmVolume * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.alarmVolume}
          onChange={(e) => save({ alarmVolume: Number(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>{t('settings.alarmMaxSeconds')}</label>
        <input
          type="number"
          min={0}
          value={s.alarmMaxSeconds}
          onChange={(e) => save({ alarmMaxSeconds: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>

      <div className="field">
        <label>{t('settings.autoCloseSeconds')}</label>
        <input
          type="number"
          min={0}
          value={s.autoCloseSeconds}
          onChange={(e) => save({ autoCloseSeconds: Math.max(0, Number(e.target.value) || 0) })}
        />
      </div>

      <label className="row">
        <input
          type="checkbox"
          checked={s.forceSystemVolume}
          onChange={(e) => save({ forceSystemVolume: e.target.checked })}
        />
        <span>{t('settings.forceSystemVolume')}</span>
      </label>

      <div className="field">
        <label>{t('settings.whitelist')}</label>
        {s.whitelist.length === 0 ? (
          <div className="hint">{t('settings.whitelist.empty')}</div>
        ) : (
          <ul className="whitelist">
            {s.whitelist.map((id) => (
              <li key={id}>
                <span className="wl-id" title={id}>
                  {id}
                </span>
                <button
                  className="btn small ghost"
                  onClick={() => save({ whitelist: s.whitelist.filter((x) => x !== id) })}
                >
                  {t('settings.whitelist.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`saved-badge ${saved ? 'show' : ''}`}>{t('settings.saved')}</div>
    </div>
  )
}
