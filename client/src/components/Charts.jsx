export function ClickChart({ points, labelFor, labelEvery = 1 }) {
  const max = Math.max(1, ...points.map((point) => point.count))
  const total = points.reduce((sum, point) => sum + point.count, 0)

  return (
    <div className="chart" role="img" aria-label={`${total} clicks across ${points.length} points`}>
      {points.map((point, index) => {
        const label = labelFor(point)
        return (
          <div className="chart-col" key={`${label}-${index}`} title={`${label}: ${point.count}`}>
            <div className="chart-bar-track">
              <div
                className="chart-bar"
                style={{ height: `${Math.max(point.count ? 6 : 0, (point.count / max) * 100)}%` }}
              />
            </div>
            <span className="chart-label">{index % labelEvery === 0 ? label : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

export function BreakdownList({ title, rows }) {
  const items = rows || []
  const max = Math.max(1, ...items.map((row) => row.count))

  return (
    <section className="breakdown">
      <h3>{title}</h3>
      {!rows ? (
        <p className="empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No data yet.</p>
      ) : (
        <ul className="breakdown-list">
          {items.map((row) => (
            <li key={row.label}>
              <div className="breakdown-meta">
                <span>{row.label}</span>
                <span>{row.count}</span>
              </div>
              <div className="breakdown-track">
                <div style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
