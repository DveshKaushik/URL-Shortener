import { useEffect, useState } from 'react'
import './App.css'
import { getLinks, login, register, shorten, SHORT_BASE } from './api.js'

const TOKEN_KEY = 'shortly_token'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [longUrl, setLongUrl] = useState('')
  const [links, setLinks] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) {
      setLinks([])
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const data = await getLinks(token)
        if (!cancelled) setLinks(data.links || [])
      } catch (err) {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken('')
          setError(err.message)
        }
      }
    })()

    return () => {
      cancelled = true
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
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
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
      const data = await shorten(token, longUrl.trim())
      setLinks((prev) => [data.link, ...prev])
      setLongUrl('')
      setNotice(`${SHORT_BASE}/${data.link.short_code}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setLinks([])
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
          <button className="logout" type="button" onClick={handleLogout}>
            Log out
          </button>
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
          <p className="hero-copy">Paste a long URL. Get a short link you can share.</p>
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
              {error ? <p className="error">{error}</p> : null}
              {notice ? <p className="success">{notice}</p> : null}
            </form>
          </div>

          <div className="links">
            <h2>Your links</h2>
            {links.length === 0 ? (
              <p className="empty">No links yet. Create your first one above.</p>
            ) : (
              links.map((link) => (
                <article className="link-item" key={link.id}>
                  <a
                    className="short"
                    href={`${SHORT_BASE}/${link.short_code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {SHORT_BASE}/{link.short_code}
                  </a>
                  <div className="long-url">{link.long_url}</div>
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
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
