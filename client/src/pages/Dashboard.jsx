import { useEffect, useState } from 'react'
import { getOverview } from '../api.js'
import { ClickChart, BreakdownList } from '../components/Charts.jsx'
import { linkLabel, summarizeLinks } from '../lib/links.js'
import { fillDays, formatWhen, placeLabel } from '../lib/series.js'

export default function Dashboard({ token, links, onOpenAnalytics }) {
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const totals = summarizeLinks(links)
  const days = fillDays(overview?.breakdowns?.byDate, 14)
  const topLinks = [...links]
    .sort((a, b) => (b.click_count ?? 0) - (a.click_count ?? 0) || b.id - a.id)
    .slice(0, 5)

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false

    async function load() {
      try {
        const data = await getOverview(token)
        if (!cancelled) {
          setOverview(data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    load()
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token])

  return (
    <div className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Clicks, visitors, and the links doing the work.</p>
      </header>

      <section className="stat-grid" aria-label="Overview">
        <article className="stat-card">
          <strong>{totals.links}</strong>
          <span>Links</span>
        </article>
        <article className="stat-card">
          <strong>{totals.clicks}</strong>
          <span>Clicks</span>
        </article>
        <article className="stat-card">
          <strong>{totals.unique}</strong>
          <span>Unique</span>
        </article>
        <article className="stat-card">
          <strong>{totals.active}</strong>
          <span>{totals.scheduled} scheduled</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>Last 14 days</h2>
            <span>{days.reduce((sum, day) => sum + day.count, 0)} clicks</span>
          </div>
          {overview ? (
            <ClickChart
              points={days}
              labelEvery={2}
              labelFor={(point) => point.date.slice(5)}
            />
          ) : (
            <p className="empty">Loading click history…</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Top links</h2>
          </div>
          {topLinks.length === 0 ? (
            <p className="empty">Create a link to see it here.</p>
          ) : (
            <ul className="rank-list">
              {topLinks.map((link) => (
                <li key={link.id}>
                  <button type="button" onClick={() => onOpenAnalytics(link.id)}>
                    <span className="rank-name">{linkLabel(link)}</span>
                    <span className="rank-meta">
                      {link.click_count ?? 0} clicks · {link.unique_click_count ?? 0} unique
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="breakdown-grid">
        <BreakdownList title="Countries" rows={overview?.breakdowns?.byCountry} />
        <BreakdownList title="Devices" rows={overview?.breakdowns?.byDevice} />
        <BreakdownList title="Sources" rows={overview?.breakdowns?.byReferrer} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent clicks</h2>
        </div>
        {!overview ? (
          <p className="empty">Loading activity…</p>
        ) : overview.recentClicks.length === 0 ? (
          <p className="empty">Clicks will show up here after someone opens a short link.</p>
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
                {overview.recentClicks.map((row, index) => (
                  <tr key={`${row.link_id}-${row.clicked_at}-${index}`}>
                    <td>{formatWhen(row.clicked_at)}</td>
                    <td>
                      <button
                        className="text-btn"
                        type="button"
                        onClick={() => onOpenAnalytics(row.link_id)}
                      >
                        {row.title || row.short_code}
                      </button>
                    </td>
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
