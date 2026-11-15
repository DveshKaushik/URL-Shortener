import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import {
  SHORT_BASE,
  checkDestination,
  deleteLink,
  getLinks,
  shorten,
  updateLink,
} from '../api.js'
import SafetyReport from '../components/SafetyReport.jsx'
import { fromLocalInputValue, linkLabel, linkStatus, toLocalInputValue } from '../lib/links.js'

function downloadQr(shortCode) {
  const canvas = document.getElementById(`qr-${shortCode}`)
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `shortly-${shortCode}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
      />
    </svg>
  )
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'expired', label: 'Expired' },
]

const PAGE_SIZE = 100

export default function MyLinks({
  token,
  links,
  setLinks,
  linksTotal,
  setLinksTotal,
  theme,
  onOpenAnalytics,
}) {
  const [longUrl, setLongUrl] = useState('')
  const [customAlias, setCustomAlias] = useState('')
  const [title, setTitle] = useState('')
  const [activatesAt, setActivatesAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [expiryDrafts, setExpiryDrafts] = useState({})
  const [destinationDrafts, setDestinationDrafts] = useState({})
  const [titleDrafts, setTitleDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [safety, setSafety] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    setScheduleDrafts((prev) => {
      const next = {}
      for (const link of links) {
        next[link.id] = link.id in prev ? prev[link.id] : toLocalInputValue(link.activates_at)
      }
      return next
    })
    setExpiryDrafts((prev) => {
      const next = {}
      for (const link of links) {
        next[link.id] = link.id in prev ? prev[link.id] : toLocalInputValue(link.expires_at)
      }
      return next
    })
    setDestinationDrafts((prev) => {
      const next = {}
      for (const link of links) {
        next[link.id] = link.id in prev ? prev[link.id] : link.long_url
      }
      return next
    })
    setTitleDrafts((prev) => {
      const next = {}
      for (const link of links) {
        next[link.id] = link.id in prev ? prev[link.id] : link.title || ''
      }
      return next
    })
  }, [links])

  useEffect(() => {
    const value = longUrl.trim()
    if (!value) {
      setSafety(null)
      setChecking(false)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setChecking(true)
      try {
        const data = await checkDestination(token, value)
        if (!cancelled) setSafety(data.safety)
      } catch {
        if (!cancelled) setSafety(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [longUrl, token])

  function replaceLink(updated) {
    setLinks((prev) => prev.map((link) => (link.id === updated.id ? updated : link)))
    setScheduleDrafts((prev) => ({
      ...prev,
      [updated.id]: toLocalInputValue(updated.activates_at),
    }))
    setExpiryDrafts((prev) => ({
      ...prev,
      [updated.id]: toLocalInputValue(updated.expires_at),
    }))
    setDestinationDrafts((prev) => ({ ...prev, [updated.id]: updated.long_url }))
    setTitleDrafts((prev) => ({ ...prev, [updated.id]: updated.title || '' }))
  }

  async function handleLoadMore() {
    setError('')
    setLoadingMore(true)
    try {
      const data = await getLinks(token, { limit: PAGE_SIZE, offset: links.length })
      setLinks((prev) => {
        const seen = new Set(prev.map((link) => link.id))
        return [...prev, ...(data.links || []).filter((link) => !seen.has(link.id))]
      })
      if (typeof data.total === 'number') setLinksTotal(data.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = links.filter((link) => {
      if (filter !== 'all' && linkStatus(link).key !== filter) return false
      if (!needle) return true
      return [link.title, link.short_code, link.long_url]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    })
    const next = [...filtered]
    next.sort((a, b) => {
      if (sort === 'clicks') {
        return (b.click_count ?? 0) - (a.click_count ?? 0) || b.id - a.id
      }
      if (sort === 'name') {
        return linkLabel(a).localeCompare(linkLabel(b))
      }
      return new Date(b.created_at) - new Date(a.created_at)
    })
    return next
  }, [links, query, filter, sort])

  async function handleShorten(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const alias = customAlias.trim()
      const name = title.trim()
      const data = await shorten(token, longUrl.trim(), {
        activatesAt: fromLocalInputValue(activatesAt),
        expiresAt: fromLocalInputValue(expiresAt),
        ...(alias ? { customAlias: alias } : {}),
        ...(name ? { title: name } : {}),
      })
      const shortUrl = `${SHORT_BASE}/${data.link.short_code}`
      setLinks((prev) => [data.link, ...prev.filter((link) => link.id !== data.link.id)])
      setLinksTotal((prev) => (typeof prev === 'number' ? prev + (data.cached ? 0 : 1) : prev))
      const flagged = data.safety?.verdict === 'warn' ? ` Flagged: ${data.safety.summary}` : ''
      setNotice((data.cached ? `Already shortened: ${shortUrl}` : shortUrl) + flagged)
      setLongUrl('')
      setCustomAlias('')
      setTitle('')
      setActivatesAt('')
      setExpiresAt('')
    } catch (err) {
      setError(err.message)
      if (err.safety) setSafety(err.safety)
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleEnabled(link) {
    setError('')
    setNotice('')
    try {
      const data = await updateLink(token, link.id, { enabled: !link.enabled })
      replaceLink(data.link)
      setNotice(data.link.enabled ? 'Link enabled' : 'Link disabled')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveSchedule(link, draftOverride) {
    setError('')
    setNotice('')
    try {
      const draft = draftOverride !== undefined ? draftOverride : scheduleDrafts[link.id] || ''
      const data = await updateLink(token, link.id, {
        activatesAt: fromLocalInputValue(draft),
      })
      replaceLink(data.link)
      setNotice(
        data.link.activates_at
          ? `Activates ${new Date(data.link.activates_at).toLocaleString()}`
          : 'Schedule cleared — link is active now'
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveExpiry(link, draftOverride) {
    setError('')
    setNotice('')
    try {
      const draft = draftOverride !== undefined ? draftOverride : expiryDrafts[link.id] || ''
      const data = await updateLink(token, link.id, {
        expiresAt: fromLocalInputValue(draft),
      })
      replaceLink(data.link)
      setNotice(
        data.link.expires_at
          ? `Expires ${new Date(data.link.expires_at).toLocaleString()}`
          : 'Expiry cleared'
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(link) {
    const label = linkLabel(link)
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return
    setError('')
    setNotice('')
    try {
      await deleteLink(token, link.id)
      setLinks((prev) => prev.filter((item) => item.id !== link.id))
      setLinksTotal((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev))
      setNotice(`Deleted ${label}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveDestination(link) {
    setError('')
    setNotice('')
    const nextUrl = (destinationDrafts[link.id] || '').trim()
    if (!nextUrl) {
      setError('Destination URL is required')
      return
    }
    if (nextUrl === link.long_url) return
    try {
      const data = await updateLink(token, link.id, { longUrl: nextUrl })
      replaceLink(data.link)
      if (data.safety) setSafety(data.safety)
      setNotice(
        data.safety?.verdict === 'warn'
          ? `Destination updated. Flagged: ${data.safety.summary}`
          : 'Destination updated'
      )
    } catch (err) {
      setError(err.message)
      if (err.safety) setSafety(err.safety)
    }
  }

  async function handleSaveTitle(link) {
    setError('')
    setNotice('')
    const nextTitle = (titleDrafts[link.id] || '').trim()
    if (nextTitle === (link.title || '')) return
    try {
      const data = await updateLink(token, link.id, { title: nextTitle || null })
      replaceLink(data.link)
      setNotice(nextTitle ? 'Name saved' : 'Name cleared')
    } catch (err) {
      setError(err.message)
    }
  }

  async function copyShort(code) {
    const url = `${SHORT_BASE}/${code}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice(`Copied ${url}`)
    } catch {
      setNotice(url)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>My Links</h1>
        <p>Name, edit, search, and download a QR code for each short URL.</p>
      </header>

      <form className="form composer-form" onSubmit={handleShorten}>
        <label>
          Long URL
          <div className="shorten-row">
            <input
              type="url"
              placeholder="https://example.com/very/long/path"
              value={longUrl}
              onChange={(event) => setLongUrl(event.target.value)}
              required
            />
            <button className="primary" type="submit" disabled={busy || safety?.verdict === 'block'}>
              {busy ? 'Shortening…' : 'Shorten'}
            </button>
          </div>
        </label>
        <div className="composer-options composer-options-4">
          <label>
            Name
            <input
              type="text"
              placeholder="Spring campaign"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            Custom alias
            <div className="alias-row">
              <span className="alias-prefix">{SHORT_BASE}/</span>
              <input
                type="text"
                placeholder="myportfolio"
                value={customAlias}
                onChange={(event) => setCustomAlias(event.target.value)}
                minLength={3}
                maxLength={64}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]|[A-Za-z0-9]{3,}"
                title="3–64 characters: letters, numbers, hyphens, underscores"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </label>
          <label className="activate-at">
            Activate at
            <input
              type="datetime-local"
              value={activatesAt}
              onChange={(event) => setActivatesAt(event.target.value)}
            />
          </label>
          <label className="activate-at">
            Expires at
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
        </div>
        {checking ? <p className="safety-checking">Checking destination…</p> : null}
        <SafetyReport safety={safety} />
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="success">{notice}</p> : null}
      </form>

      <section className="links" aria-label="Your links">
        <div className="links-toolbar">
          <label className="search-field">
            Search
            <input
              type="search"
              placeholder="Name, alias, or URL"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filter-row" role="tablist" aria-label="Filter by status">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? 'active' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="sort-field">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="clicks">Most clicks</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="links-head">
          <h2>Library</h2>
          <span className="links-count">
            {visible.length}
            {visible.length !== links.length ? ` of ${links.length}` : ''}
            {typeof linksTotal === 'number' && linksTotal > links.length
              ? ` · ${linksTotal} total`
              : ''}
          </span>
        </div>

        {links.length === 0 ? (
          <p className="empty">No links yet. Create your first one above.</p>
        ) : visible.length === 0 ? (
          <p className="empty">Nothing matches that search.</p>
        ) : (
          visible.map((link, index) => {
            const shortUrl = `${SHORT_BASE}/${link.short_code}`
            const status = linkStatus(link)
            return (
              <article
                className={`link-item ${status.key === 'disabled' ? 'is-disabled' : ''}`}
                key={link.id}
                style={{ '--i': Math.min(index, 8) }}
              >
                <div className="link-main">
                  <div className="link-title-row">
                    <div className="short-url">
                      <a className="short" href={shortUrl} target="_blank" rel="noreferrer">
                        {shortUrl}
                      </a>
                      <button
                        className="copy-icon"
                        type="button"
                        aria-label={`Copy ${shortUrl}`}
                        onClick={() => copyShort(link.short_code)}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                    <span className={`status status-${status.key}`}>{status.label}</span>
                  </div>

                  <div className="link-destination">
                    <label>
                      Name
                      <input
                        type="text"
                        placeholder="Add a name"
                        maxLength={80}
                        value={titleDrafts[link.id] ?? ''}
                        onChange={(event) =>
                          setTitleDrafts((prev) => ({ ...prev, [link.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => handleSaveTitle(link)}
                      disabled={(titleDrafts[link.id] ?? '').trim() === (link.title || '')}
                    >
                      Save name
                    </button>
                  </div>

                  <div className="link-destination">
                    <label>
                      Destination
                      <input
                        type="url"
                        value={destinationDrafts[link.id] ?? link.long_url}
                        onChange={(event) =>
                          setDestinationDrafts((prev) => ({
                            ...prev,
                            [link.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => handleSaveDestination(link)}
                      disabled={
                        (destinationDrafts[link.id] ?? link.long_url).trim() === link.long_url
                      }
                    >
                      Save URL
                    </button>
                  </div>

                  <div className="link-meta">
                    <span>{link.click_count ?? 0} clicks</span>
                    <span>{link.unique_click_count ?? 0} unique</span>
                    <span>{new Date(link.created_at).toLocaleString()}</span>
                    <button className="ghost-btn" type="button" onClick={() => handleToggleEnabled(link)}>
                      {link.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="ghost-btn" type="button" onClick={() => onOpenAnalytics(link.id)}>
                      Analytics
                    </button>
                    <button className="ghost-btn danger-btn" type="button" onClick={() => handleDelete(link)}>
                      Delete
                    </button>
                  </div>

                  <div className="link-schedule">
                    <label className="activate-at">
                      Activate at
                      <input
                        type="datetime-local"
                        value={scheduleDrafts[link.id] || ''}
                        onChange={(event) =>
                          setScheduleDrafts((prev) => ({ ...prev, [link.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button className="ghost-btn" type="button" onClick={() => handleSaveSchedule(link)}>
                      Save schedule
                    </button>
                    {scheduleDrafts[link.id] || link.activates_at ? (
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => {
                          setScheduleDrafts((prev) => ({ ...prev, [link.id]: '' }))
                          handleSaveSchedule(link, '')
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <div className="link-schedule">
                    <label className="activate-at">
                      Expires at
                      <input
                        type="datetime-local"
                        value={expiryDrafts[link.id] || ''}
                        onChange={(event) =>
                          setExpiryDrafts((prev) => ({ ...prev, [link.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button className="ghost-btn" type="button" onClick={() => handleSaveExpiry(link)}>
                      Save expiry
                    </button>
                    {expiryDrafts[link.id] || link.expires_at ? (
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => {
                          setExpiryDrafts((prev) => ({ ...prev, [link.id]: '' }))
                          handleSaveExpiry(link, '')
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="link-qr">
                  <div className="qr-frame" title={shortUrl}>
                    <QRCodeCanvas
                      id={`qr-${link.short_code}`}
                      value={shortUrl}
                      size={96}
                      bgColor={theme === 'dark' ? '#e8f5ef' : '#f3faf6'}
                      fgColor={theme === 'dark' ? '#071410' : '#0b1f1a'}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <button
                    className="ghost-btn qr-download"
                    type="button"
                    onClick={() => downloadQr(link.short_code)}
                  >
                    Download QR
                  </button>
                </div>
              </article>
            )
          })
        )}

        {typeof linksTotal === 'number' && links.length < linksTotal ? (
          <div className="load-more-row">
            <button
              className="ghost-btn"
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : `Load more (${links.length} of ${linksTotal})`}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
