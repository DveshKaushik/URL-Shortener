const GROUPS = [
  { id: 'suspicious', title: 'Suspicious URL' },
  { id: 'reputation', title: 'Domain reputation' },
  { id: 'phishing', title: 'Phishing indicators' },
  { id: 'malicious', title: 'Known malicious' },
]

const REPUTATION_LABEL = {
  clean: 'Clean',
  unknown: 'Unknown',
  low: 'Low',
  malicious: 'Malicious',
}

export default function SafetyReport({ safety }) {
  if (!safety) return null

  const grouped = GROUPS.map((group) => ({
    ...group,
    items: safety.indicators.filter((item) => item.category === group.id),
  }))

  return (
    <section className={`safety-card is-${safety.verdict}`} aria-live="polite">
      <div className="safety-head">
        <strong>{safety.domain || 'Destination'}</strong>
        <span className={`safety-pill is-${safety.verdict}`}>
          {safety.verdict === 'block' ? 'Blocked' : safety.verdict === 'warn' ? 'Flagged' : 'Clear'}
        </span>
        <span className="safety-rep">
          Reputation {REPUTATION_LABEL[safety.reputation] || safety.reputation} · risk {safety.risk}
        </span>
      </div>
      <p className="safety-summary">{safety.summary}</p>
      <div className="safety-grid">
        {grouped.map((group) => (
          <div key={group.id} className="safety-group">
            <h3>{group.title}</h3>
            {group.items.length === 0 ? (
              <p>None found</p>
            ) : (
              <ul>
                {group.items.map((item) => (
                  <li key={item.message} className={`sev-${item.severity}`}>
                    {item.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
