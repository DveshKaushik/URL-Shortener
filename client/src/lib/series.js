function utcDayKey(date) {
  return date.toISOString().slice(0, 10)
}

export function fillDays(rows, days) {
  const map = new Map((rows || []).map((row) => [row.date, row.count]))
  const today = new Date()
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const points = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(cursor)
    day.setUTCDate(cursor.getUTCDate() - i)
    const date = utcDayKey(day)
    points.push({ date, count: map.get(date) || 0 })
  }
  return points
}

export function fillHours(rows) {
  const map = new Map((rows || []).map((row) => [Number(row.hour), row.count]))
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, '0'),
    count: map.get(hour) || 0,
  }))
}

export function formatWhen(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function placeLabel(row) {
  const parts = [row.city, row.country].filter(Boolean)
  return parts.join(', ') || 'Unknown'
}
