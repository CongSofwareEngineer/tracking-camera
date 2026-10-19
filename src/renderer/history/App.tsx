import { useEffect, useState } from 'react'
import type { HistoryRecord } from '../shared/types'
import { t, formatDateTime, formatDuration } from '../shared/i18n'

export function HistoryApp(): JSX.Element {
  const [rows, setRows] = useState<HistoryRecord[]>([])

  useEffect(() => {
    void window.camguard.getHistory().then(setRows)
    const off = window.camguard.onHistoryChanged(setRows)
    return off
  }, [])

  const onClear = async () => {
    if (confirm(t('history.clear.confirm'))) {
      await window.camguard.clearHistory()
      setRows([])
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('history.title')}</h1>
        <button className="btn small ghost" onClick={onClear} disabled={rows.length === 0}>
          {t('history.clear')}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="hint">{t('history.empty')}</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('history.col.app')}</th>
              <th>{t('history.col.device')}</th>
              <th>{t('history.col.start')}</th>
              <th>{t('history.col.end')}</th>
              <th>{t('history.col.duration')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td title={r.appId}>{r.appName}</td>
                <td>{r.device || '—'}</td>
                <td>{formatDateTime(r.start)}</td>
                <td>{r.end ? formatDateTime(r.end) : <span className="ongoing">{t('history.ongoing')}</span>}</td>
                <td>{formatDuration(r.durationSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
