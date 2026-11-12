import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import './App.css'
import {
  getLinks,
  getMe,
  login,
  register,
  shorten,
  updateLink,
  SHORT_BASE,
} from './api.js'

function downloadQr(shortCode) {
  const canvas = document.getElementById(`qr-${shortCode}`)
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `shortly-${shortCode}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(value) {
  if (!value) return null
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  )
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi)
  )
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function linkStatus(link) {
  if (link.activates_at && new Date(link.activates_at) > new Date()) {
    return { key: 'scheduled', label: 'Scheduled' }
  }
  if (!link.enabled) return { key: 'disabled', label: 'Disabled' }
  return { key: 'active', label: 'Active' }
}

const TOKEN_KEY = 'shortly_token'
const EMAIL_KEY = 'shortly_email'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '')
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [longUrl, setLongUrl] = useState('')
  const [customAlias, setCustomAlias] = useState('')
  const [activatesAt, setActivatesAt] = useState('')
  const [links, setLinks] = useState([])
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [destinationDrafts, setDestinationDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setToken('')
    setUserEmail('')
    setLinks([])
  }

  function syncScheduleDrafts(nextLinks) {
    const drafts = {}
    for (const link of nextLinks) {
      drafts[link.id] = toLocalInputValue(link.activates_at)
    }
    setScheduleDrafts(drafts)
  }

  function syncDestinationDrafts(nextLinks) {
    const drafts = {}
    for (const link of nextLinks) {
      drafts[link.id] = link.long_url
    }
    setDestinationDrafts(drafts)
  }

  function replaceLink(updated) {
    setLinks((prev) => {
      const next = prev.map((l) => (l.id === updated.id ? updated : l))
      return next
    })
    setScheduleDrafts((prev) => ({
      ...prev,
      [updated.id]: toLocalInputValue(updated.activates_at),
    }))
    setDestinationDrafts((prev) => ({
      ...prev,
      [updated.id]: updated.long_url,
    }))
  }

  useEffect(() => {
    if (!token) {
      setLinks([])
      return
    }

    let cancelled = false

    async function loadSession() {
      try {
        if (!userEmail) {
          const me = await getMe(token)
          const nextEmail = me.user?.email || ''
          if (!cancelled && nextEmail) {
            localStorage.setItem(EMAIL_KEY, nextEmail)
            setUserEmail(nextEmail)
          }
        }
        const data = await getLinks(token)
        if (!cancelled) {
          const nextLinks = data.links || []
          setLinks(nextLinks)
          syncScheduleDrafts(nextLinks)
          syncDestinationDrafts(nextLinks)
        }
      } catch (err) {
        if (!cancelled) {
          clearSession()
          setError(err.message)
        }
      }
    }

    loadSession()

    function onVisible() {
      if (document.visibilityState === 'visible') {
        getLinks(token)
          .then((data) => {
            if (!cancelled) {
              const nextLinks = data.links || []
              setLinks(nextLinks)
              syncScheduleDrafts(nextLinks)
              syncDestinationDrafts(nextLinks)
            }
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [token])

  async function handleAuth(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'register') {
        await register(email, password)
        setNotice('Account created. Signing you in…')
      }
      const data = await login(email, password)
      const nextEmail = data.user?.email || email
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(EMAIL_KEY, nextEmail)
      setToken(data.token)
      setUserEmail(nextEmail)
      setPassword('')
      setNotice('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleShorten(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const alias = customAlias.trim()
      const data = await shorten(token, longUrl.trim(), {
        activatesAt: fromLocalInputValue(activatesAt),
        ...(alias ? { customAlias: alias } : {}),
      })
      const shortUrl = `${SHORT_BASE}/${data.link.short_code}`
      if (data.cached) {
        setLinks((prev) => {
          const without = prev.filter((l) => l.id !== data.link.id)
          return [data.link, ...without]
        })
        setNotice(`Already shortened: ${shortUrl}`)
      } else {
        setLinks((prev) => [data.link, ...prev])
        setNotice(shortUrl)
      }
      setScheduleDrafts((prev) => ({
        ...prev,
        [data.link.id]: toLocalInputValue(data.link.activates_at),
      }))
      setDestinationDrafts((prev) => ({
        ...prev,
        [data.link.id]: data.link.long_url,
      }))
      setLongUrl('')
      setCustomAlias('')
      setActivatesAt('')
    } catch (err) {
      setError(err.message)
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
      const draft =
        draftOverride !== undefined
          ? draftOverride
          : scheduleDrafts[link.id] || ''
      const data = await updateLink(token, link.id, {
        activatesAt: fromLocalInputValue(draft),
      })
      replaceLink(data.link)
      setNotice(
        data.link.activates_at
          ? `Activates ${new Date(data.link.activates_at).toLocaleString()}`
          : 'Schedule cleared — link active now'
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearSchedule(link) {
    setScheduleDrafts((prev) => ({ ...prev, [link.id]: '' }))
    await handleSaveSchedule(link, '')
  }

  async function handleSaveDestination(link) {
    setError('')
    setNotice('')
    const nextUrl = (destinationDrafts[link.id] || '').trim()
    if (!nextUrl) {
      setError('Destination URL is required')
      return
    }
    if (nextUrl === link.long_url) {
      setNotice('Destination unchanged')
      return
    }
    try {
      const data = await updateLink(token, link.id, { longUrl: nextUrl })
      replaceLink(data.link)
      setNotice('Destination updated')
    } catch (err) {
      setError(err.message)
    }
  }

  function handleLogout() {
    clearSession()
    setNotice('')
    setError('')
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
    <div className="app">
      <header className="brand">
        <div className="brand-mark">
          <h1>Shortly</h1>
          <span>url shortener</span>
        </div>
        {token ? (
          <div className="user-bar">
            {userEmail ? <span className="user-name">{userEmail}</span> : null}
            <button className="logout" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : null}
      </header>

      {!token ? (
        <>
          <p className="hero-copy">
            Turn long links into short codes. Sign in to create and track them.
          </p>
          <section className="panel">
            <div className="tabs">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'active' : ''}
                onClick={() => {
                  setMode('register')
                  setError('')
                }}
              >
                Create account
              </button>
            </div>
            <form className="form" onSubmit={handleAuth}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              {notice ? <p className="success">{notice}</p> : null}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="workspace">
          <p className="hero-copy">
            Paste a long URL. Optionally pick a custom alias like{' '}
            <span className="inline-mono">/myportfolio</span>.
          </p>
          <div className="panel">
            <form className="form" onSubmit={handleShorten}>
              <label>
                Long URL
                <div className="shorten-row">
                  <input
                    type="url"
                    placeholder="https://example.com/very/long/path"
                    value={longUrl}
                    onChange={(e) => setLongUrl(e.target.value)}
                    required
                  />
                  <button className="primary" type="submit" disabled={busy}>
                    {busy ? 'Shortening…' : 'Shorten'}
                  </button>
                </div>
              </label>
              <label>
                Custom alias (optional)
                <div className="alias-row">
                  <span className="alias-prefix">{SHORT_BASE}/</span>
                  <input
                    type="text"
                    placeholder="myportfolio"
                    value={customAlias}
                    onChange={(e) => setCustomAlias(e.target.value)}
                    minLength={3}
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]|[A-Za-z0-9]{3,}"
                    title="3–64 characters: letters, numbers, hyphens, underscores"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </label>
              <label>
                Activate at (optional)
                <input
                  type="datetime-local"
                  value={activatesAt}
                  onChange={(e) => setActivatesAt(e.target.value)}
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              {notice ? <p className="success">{notice}</p> : null}
            </form>
          </div>

          <div className="links">
            <h2>Your links</h2>
            {links.length === 0 ? (
              <p className="empty">No links yet. Create your first one above.</p>
            ) : (
              links.map((link) => {
                const shortUrl = `${SHORT_BASE}/${link.short_code}`
                const status = linkStatus(link)
                return (
                  <article
                    className={`link-item ${status.key === 'disabled' ? 'is-disabled' : ''}`}
                    key={link.id}
                  >
                    <div className="link-main">
                      <div className="link-title-row">
                        <a
                          className="short"
                          href={shortUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortUrl}
                        </a>
                        <span className={`status-pill status-${status.key}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="link-destination">
                        <label>
                          Destination
                          <input
                            type="url"
                            value={destinationDrafts[link.id] ?? link.long_url}
                            onChange={(e) =>
                              setDestinationDrafts((prev) => ({
                                ...prev,
                                [link.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={() => handleSaveDestination(link)}
                          disabled={
                            (destinationDrafts[link.id] ?? link.long_url).trim() ===
                            link.long_url
                          }
                        >
                          Save URL
                        </button>
                      </div>
                      <div className="link-meta">
                        <span>{link.click_count ?? 0} clicks</span>
                        <span>{new Date(link.created_at).toLocaleString()}</span>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={() => copyShort(link.short_code)}
                        >
                          Copy
                        </button>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={() => downloadQr(link.short_code)}
                        >
                          Download QR
                        </button>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={() => handleToggleEnabled(link)}
                        >
                          {link.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                      <div className="link-schedule">
                        <label>
                          Activate at
                          <input
                            type="datetime-local"
                            value={scheduleDrafts[link.id] || ''}
                            onChange={(e) =>
                              setScheduleDrafts((prev) => ({
                                ...prev,
                                [link.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          className="copy-btn"
                          type="button"
                          onClick={() => handleSaveSchedule(link)}
                        >
                          Save schedule
                        </button>
                        {scheduleDrafts[link.id] || link.activates_at ? (
                          <button
                            className="copy-btn"
                            type="button"
                            onClick={() => handleClearSchedule(link)}
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="link-qr" title={shortUrl}>
                      <QRCodeCanvas
                        id={`qr-${link.short_code}`}
                        value={shortUrl}
                        size={96}
                        bgColor="#e8f5ef"
                        fgColor="#071410"
                        level="M"
                        includeMargin
                      />
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>
      )}
    </div>
  )
}
