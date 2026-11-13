import { useEffect, useState } from 'react'
import { getLinkAnalytics, getOverview } from '../api.js'
import { ClickChart, BreakdownList } from '../components/Charts.jsx'
import { linkLabel } from '../lib/links.js'
import { fillDays, fillHours, formatWhen, placeLabel } from '../lib/series.js'

export default function Analytics({ token, links, linkId, onLinkChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const selected = links.find((link) => link.id === linkId) || null

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const next = linkId ? await getLinkAnalytics(token, linkId) : await getOverview(token)
        if (!cancelled) {
          setData(next)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token, linkId])

  const breakdowns = data?.breakdowns
  const days = fillDays(breakdowns?.byDate, 30)
  const hours = fillHours(breakdowns?.byHour)
  const recent = data?.recentClicks || []
  const totals = linkId
    ? data?.totals
    : {
        clicks: links.reduce((sum, link) => sum + (link.click_count ?? 0), 0),
        uniqueClicks: links.reduce((sum, link) => sum + (link.unique_click_count ?? 0), 0),
      }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Analytics</h1>
          <p>Where clicks come from, and when they happen.</p>
        </div>
        <label className="sort-field">
          Link
          <select
            value={linkId || ''}
            onChange={(event) => onLinkChange(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">All links</option>
            {links.map((link) => (
              <option key={link.id} value={link.id}>
                {linkLabel(link)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="stat-grid stat-grid-3" aria-label="Totals">
        <article className="stat-card">
          <strong>{totals?.clicks ?? 0}</strong>
          <span>Clicks</span>
        </article>
        <article className="stat-card">
          <strong>{totals?.uniqueClicks ?? 0}</strong>
          <span>Unique</span>
        </article>
        <article className="stat-card">
          <strong>{selected ? linkLabel(selected) : 'All links'}</strong>
          <span>{selected ? selected.short_code : `${links.length} links`}</span>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Last 30 days</h2>
          <span>{loading ? 'Loading…' : `${days.reduce((sum, day) => sum + day.count, 0)} clicks`}</span>
        </div>
        {loading ? (
          <p className="empty">Loading chart…</p>
        ) : (
          <ClickChart points={days} labelEvery={5} labelFor={(point) => point.date.slice(5)} />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Hour of day</h2>
          <span>UTC</span>
        </div>
        {loading ? (
          <p className="empty">Loading chart…</p>
        ) : (
          <ClickChart points={hours} labelEvery={3} labelFor={(point) => point.label} />
        )}
      </section>

      <div className="breakdown-grid">
        <BreakdownList title="Countries" rows={breakdowns?.byCountry} />
        <BreakdownList title="Cities" rows={breakdowns?.byCity} />
        <BreakdownList title="Devices" rows={breakdowns?.byDevice} />
        <BreakdownList title="Browsers" rows={breakdowns?.byBrowser} />
        <BreakdownList title="Operating systems" rows={breakdowns?.byOs} />
        <BreakdownList title="Sources" rows={breakdowns?.byReferrer} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent clicks</h2>
        </div>
        {loading ? (
          <p className="empty">Loading activity…</p>
        ) : recent.length === 0 ? (
          <p className="empty">No clicks recorded for this view yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Where</th>
                  <th>Device</th>
                  <th>Browser</th>
                  <th>Source</th>
                  <th>Visit</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row, index) => (
                  <tr key={`${row.clicked_at}-${index}`}>
                    <td>{formatWhen(row.clicked_at)}</td>
                    <td>{placeLabel(row)}</td>
                    <td>{row.device || 'Unknown'}</td>
                    <td>{row.browser || 'Unknown'}</td>
                    <td>{row.referrer_source || 'direct'}</td>
                    <td>{row.is_unique ? 'Unique' : 'Return'}</td>
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
