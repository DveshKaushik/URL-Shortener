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
    throw new Error(data.error || 'Request failed')
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

export function shorten(token, longUrl, options = {}) {
  const body = { longUrl }
  if (typeof options.enabled === 'boolean') {
    body.enabled = options.enabled
  }
  if (options.activatesAt) {
    body.activatesAt = options.activatesAt
  }
  if (options.customAlias) {
    body.customAlias = options.customAlias
  }
  return request('/api/shorten', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
}

export function getLinks(token) {
  return request('/api/links', {
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
