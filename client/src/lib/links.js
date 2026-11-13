export function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInputValue(value) {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function dateInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function rangeFromDateInputs(fromValue, toValue) {
  const start = fromValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const end = toValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!start || !end) return null
  const from = new Date(Number(start[1]), Number(start[2]) - 1, Number(start[3]), 0, 0, 0, 0)
  const to = new Date(Number(end[1]), Number(end[2]) - 1, Number(end[3]) + 1, 0, 0, 0, 0)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null
  return { from: from.toISOString(), to: to.toISOString() }
}

export function linkStatus(link) {
  if (link.activates_at && new Date(link.activates_at) > new Date()) {
    return { key: 'scheduled', label: 'Scheduled' }
  }
  if (!link.enabled) return { key: 'disabled', label: 'Disabled' }
  return { key: 'active', label: 'Active' }
}

export function linkLabel(link) {
  return link.title?.trim() || link.short_code
}

export function summarizeLinks(links) {
  const totals = {
    links: links.length,
    clicks: 0,
    unique: 0,
    active: 0,
    scheduled: 0,
    disabled: 0,
  }
  for (const link of links) {
    totals.clicks += link.click_count ?? 0
    totals.unique += link.unique_click_count ?? 0
    totals[linkStatus(link).key] += 1
  }
  return totals
}
