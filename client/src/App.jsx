import { useEffect, useState } from 'react'
import './App.css'
import { getLinks, getMe, login, register } from './api.js'
import Analytics from './pages/Analytics.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MyLinks from './pages/MyLinks.jsx'
import Reports from './pages/Reports.jsx'

const TOKEN_KEY = 'shortly_token'
const EMAIL_KEY = 'shortly_email'
const THEME_KEY = 'shortly_theme'

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'links', label: 'My Links' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports', label: 'Reports' },
]

function initialTheme() {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (document.documentElement.dataset.theme === 'dark') return 'dark'
  if (document.documentElement.dataset.theme === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ThemeIcon({ theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
      />
    </svg>
  )
}

function ThemeToggle({ theme, onToggle }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-pressed={theme === 'dark'}
      aria-label={`Switch to ${next} mode`}
    >
      <ThemeIcon theme={next} />
    </button>
  )
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '')
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [links, setLinks] = useState([])
  const [view, setView] = useState('dashboard')
  const [analyticsLinkId, setAnalyticsLinkId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange() {
      if (localStorage.getItem(THEME_KEY)) return
      setTheme(media.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setToken('')
    setUserEmail('')
    setLinks([])
    setView('dashboard')
    setAnalyticsLinkId(null)
  }

  useEffect(() => {
    if (!token) {
      setLinks([])
      return undefined
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
        if (!cancelled) setLinks(data.links || [])
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
            if (!cancelled) setLinks(data.links || [])
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

  async function handleAuth(event) {
    event.preventDefault()
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
      setView('dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    clearSession()
    setNotice('')
    setError('')
  }

  function openAnalytics(linkId) {
    setAnalyticsLinkId(linkId)
    setView('analytics')
  }

  return (
    <div className={`app ${token ? 'app-workspace' : 'app-auth'}`}>
      <div className="ambient" aria-hidden="true">
        <span className="ambient-orb ambient-orb-a" />
        <span className="ambient-orb ambient-orb-b" />
        <span className="ambient-grid" />
      </div>

      {!token ? (
        <>
          <div className="chrome">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <main className="auth-stage">
            <div className="auth-brand">
              <p className="wordmark">Shortly</p>
              <h1 className="auth-headline">Short links that stay yours.</h1>
              <p className="auth-lede">
                Sign in to create aliases, schedule go-live times, and track clicks.
              </p>
            </div>

            <section className="auth-panel" aria-label="Account">
              <div className="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
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
                  role="tab"
                  aria-selected={mode === 'register'}
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
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
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
          </main>
        </>
      ) : (
        <div className="workspace-shell">
          <header className="topbar">
            <p className="wordmark wordmark-sm">Shortly</p>
            <div className="user-bar">
              {userEmail ? <span className="user-name">{userEmail}</span> : null}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </header>

          <div className="workspace-frame">
            <nav className="sidenav" aria-label="Sections">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? 'active' : ''}
                  aria-current={view === item.id ? 'page' : undefined}
                  onClick={() => setView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <main className="workspace-main">
              {view === 'dashboard' ? (
                <Dashboard token={token} links={links} onOpenAnalytics={openAnalytics} />
              ) : null}
              {view === 'links' ? (
                <MyLinks
                  token={token}
                  links={links}
                  setLinks={setLinks}
                  theme={theme}
                  onOpenAnalytics={openAnalytics}
                />
              ) : null}
              {view === 'analytics' ? (
                <Analytics
                  token={token}
                  links={links}
                  linkId={analyticsLinkId}
                  onLinkChange={setAnalyticsLinkId}
                />
              ) : null}
              {view === 'reports' ? <Reports token={token} links={links} /> : null}
            </main>
          </div>
        </div>
      )}
    </div>
  )
}
