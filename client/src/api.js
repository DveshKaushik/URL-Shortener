const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'
export const SHORT_BASE = API_BASE

function authHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed')
    error.safety = data.safety || null
    throw error
  }
  return data
}

export function register(email, password) {
  return request('/api/register', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  })
}

export function login(email, password) {
  return request('/api/login', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  })
}

export function getMe(token) {
  return request('/api/me', {
    headers: authHeaders(token),
  })
}

export function checkDestination(token, longUrl) {
  return request('/api/safety', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ longUrl }),
  })
}

export function shorten(token, longUrl, options = {}) {
  const body = { longUrl }
  if (typeof options.enabled === 'boolean') {
    body.enabled = options.enabled
  }
  if (options.activatesAt) {
    body.activatesAt = options.activatesAt
  }
  if ('expiresAt' in options) {
    body.expiresAt = options.expiresAt
  }
  if (options.customAlias) {
    body.customAlias = options.customAlias
  }
  if (options.title) {
    body.title = options.title
  }
  return request('/api/shorten', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
}

export function getLinks(token, { limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return request(`/api/links?${params}`, {
    headers: authHeaders(token),
  })
}

export function updateLink(token, id, patch) {
  return request(`/api/links/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  })
}

export function deleteLink(token, id) {
  return request(`/api/links/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function getOverview(token) {
  return request('/api/analytics/overview', {
    headers: authHeaders(token),
  })
}

export function getLinkAnalytics(token, id) {
  return request(`/api/links/${id}/analytics`, {
    headers: authHeaders(token),
  })
}

export function getReport(token, { from, to, linkId } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (linkId) params.set('linkId', String(linkId))
  const query = params.toString()
  return request(`/api/reports${query ? `?${query}` : ''}`, {
    headers: authHeaders(token),
  })
}
