import { useEffect, useState } from 'react'
import { getReport } from '../api.js'
import { downloadCsvReport, downloadPdfReport } from '../lib/exportReport.js'
import { dateInputValue, linkLabel, rangeFromDateInputs } from '../lib/links.js'
import { formatWhen, placeLabel } from '../lib/series.js'

function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: dateInputValue(from), to: dateInputValue(to) }
}

export default function Reports({ token, links }) {
  const initial = defaultRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [linkId, setLinkId] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return undefined
    const range = rangeFromDateInputs(from, to)
    if (!range) {
      setError('Choose a start date that is on or before the end date')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    getReport(token, { ...range, linkId: linkId || undefined })
      .then((data) => {
        if (!cancelled) {
          setReport(data)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, from, to, linkId])

  const preview = report?.clicks?.slice(0, 20) || []

  return (
    <div className="page">
      <header className="page-head">
        <h1>Reports</h1>
        <p>Filter a date range, then download the click log as CSV or PDF.</p>
      </header>

      <div className="report-filters">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Link
          <select value={linkId} onChange={(event) => setLinkId(event.target.value)}>
            <option value="">All links</option>
            {links.map((link) => (
              <option key={link.id} value={link.id}>
                {linkLabel(link)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid stat-grid-3" aria-label="Report summary">
        <article className="stat-card">
          <strong>{report?.summary.clicks ?? 0}</strong>
          <span>Clicks in range</span>
        </article>
        <article className="stat-card">
          <strong>{report?.summary.uniqueClicks ?? 0}</strong>
          <span>Unique in range</span>
        </article>
        <article className="stat-card">
          <strong>{report?.summary.links ?? 0}</strong>
          <span>Links included</span>
        </article>
      </section>

      <div className="export-row">
        <button
          className="primary"
          type="button"
          disabled={!report || loading}
          onClick={() => downloadCsvReport(report)}
        >
          Export CSV
        </button>
        <button
          className="ghost-btn"
          type="button"
          disabled={!report || loading}
          onClick={() => downloadPdfReport(report)}
        >
          Export PDF
        </button>
        {report?.truncated ? (
          <span className="links-count">Export includes the latest 5,000 clicks.</span>
        ) : null}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Preview</h2>
          <span>{loading ? 'Loading…' : `${report?.clicks.length ?? 0} clicks`}</span>
        </div>
        {loading ? (
          <p className="empty">Building the report…</p>
        ) : preview.length === 0 ? (
          <p className="empty">No clicks in this range. The export still includes link totals.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Link</th>
                  <th>Where</th>
                  <th>Device</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={`${row.clicked_at}-${row.short_code}-${index}`}>
                    <td>{formatWhen(row.clicked_at)}</td>
                    <td>{row.title || row.short_code}</td>
                    <td>{placeLabel(row)}</td>
                    <td>{row.device || 'Unknown'}</td>
                    <td>{row.referrer_source || 'direct'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
