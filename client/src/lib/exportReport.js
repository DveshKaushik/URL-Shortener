function csvCell(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function stamp() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function downloadCsvReport(report) {
  const headers = [
    'clicked_at',
    'short_code',
    'title',
    'long_url',
    'unique',
    'country',
    'city',
    'device',
    'os',
    'browser',
    'referrer_source',
    'referrer',
  ]
  const lines = [headers.join(',')]
  for (const row of report.clicks) {
    lines.push(
      [
        row.clicked_at,
        row.short_code,
        row.title || '',
        row.long_url,
        row.is_unique ? 'yes' : 'no',
        row.country || '',
        row.city || '',
        row.device || '',
        row.os || '',
        row.browser || '',
        row.referrer_source || '',
        row.referrer || '',
      ]
        .map(csvCell)
        .join(',')
    )
  }
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  downloadBlob(`shortly-report-${stamp()}.csv`, blob)
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function clip(value, max) {
  const text = String(value ?? '').replace(/[^\x20-\x7E]/g, '?')
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3))}...`
}

function asciiStamp(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function textAt(x, y, size, value) {
  return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET\n`
}

function buildPdf(pageStreams) {
  const encoder = new TextEncoder()
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  const add = (body) => {
    offsets.push(encoder.encode(pdf).length)
    pdf += body
  }

  const pageIds = pageStreams.map((_, index) => 4 + index * 2)
  add('1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  add(
    `2 0 obj << /Type /Pages /Count ${pageStreams.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`
  )
  add('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')

  pageStreams.forEach((stream, index) => {
    const pageId = 4 + index * 2
    const contentId = pageId + 1
    add(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
    )
    add(`${contentId} 0 obj << /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`)
  })

  const xref = encoder.encode(pdf).length
  pdf += `xref\n0 ${offsets.length}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return encoder.encode(pdf)
}

function pageStream(rows, pageIndex, pageCount) {
  let stream = '0 0 0 RG\n0 0 0 rg\n'
  for (const row of rows) {
    if (row.rule) {
      stream += `${row.x1} ${row.y} m ${row.x2} ${row.y} l S\n`
    }
    for (const cell of row.cells || []) {
      stream += textAt(cell.x, row.y, cell.size || 9, cell.text)
    }
  }
  stream += textAt(40, 28, 8, `Shortly report  ·  Page ${pageIndex + 1} of ${pageCount}`)
  return stream
}

export function downloadPdfReport(report) {
  const generated = asciiStamp(new Date())
  const from = asciiStamp(report.range.from).slice(0, 10)
  const to = asciiStamp(new Date(new Date(report.range.to).getTime() - 1)).slice(0, 10)
  const columns = [
    { x: 40, key: 'when', width: 18 },
    { x: 128, key: 'code', width: 16 },
    { x: 230, key: 'where', width: 18 },
    { x: 340, key: 'device', width: 14 },
    { x: 430, key: 'source', width: 22 },
  ]

  const headerCells = [
    { x: 40, text: 'When', size: 8 },
    { x: 128, text: 'Link', size: 8 },
    { x: 230, text: 'Location', size: 8 },
    { x: 340, text: 'Device', size: 8 },
    { x: 430, text: 'Source', size: 8 },
  ]

  const intro = [
    { y: 752, cells: [{ x: 40, text: 'Shortly', size: 18 }] },
    { y: 730, cells: [{ x: 40, text: 'Click report', size: 12 }] },
    {
      y: 710,
      cells: [{ x: 40, text: `${from} to ${to}    Generated ${generated}`, size: 9 }],
    },
    {
      y: 688,
      cells: [
        {
          x: 40,
          text: `${report.summary.clicks} clicks    ${report.summary.uniqueClicks} unique    ${report.summary.links} links`,
          size: 10,
        },
      ],
    },
  ]

  const linkRows = report.links.slice(0, 8).map((link, index) => ({
    y: 664 - index * 13,
    cells: [
      {
        x: 40,
        size: 8,
        text: clip(
          `${link.short_code}  ${link.title ? `${link.title}  ` : ''}${link.clicks_in_range} clicks`,
          90
        ),
      },
    ],
  }))

  let cursor = 664 - linkRows.length * 13 - 8
  if (report.links.length > 8) {
    linkRows.push({
      y: cursor,
      cells: [{ x: 40, size: 8, text: `+ ${report.links.length - 8} more links in this range` }],
    })
    cursor -= 16
  } else {
    cursor -= 8
  }

  const clickRows = report.clicks.slice(0, 400).map((row) => ({
    cells: [
      { x: columns[0].x, size: 8, text: clip(asciiStamp(row.clicked_at), 20) },
      { x: columns[1].x, size: 8, text: clip(row.title || row.short_code, columns[1].width) },
      {
        x: columns[2].x,
        size: 8,
        text: clip([row.city, row.country].filter(Boolean).join(', ') || 'Unknown', columns[2].width),
      },
      { x: columns[3].x, size: 8, text: clip(row.device || 'Unknown', columns[3].width) },
      { x: columns[4].x, size: 8, text: clip(row.referrer_source || 'direct', columns[4].width) },
    ],
  }))

  const pages = []
  const firstCapacity = Math.max(8, Math.floor((cursor - 56) / 14))
  const laterCapacity = 46

  const pushPage = (bodyRows) => {
    pages.push(bodyRows)
  }

  const first = [...intro, ...linkRows]
  first.push({ y: cursor, rule: true, x1: 40, x2: 572 })
  first.push({ y: cursor - 16, cells: headerCells })
  let y = cursor - 32
  const firstClicks = clickRows.slice(0, firstCapacity)
  for (const row of firstClicks) {
    first.push({ y, cells: row.cells })
    y -= 14
  }
  if (clickRows.length === 0) {
    first.push({ y: y, cells: [{ x: 40, size: 9, text: 'No clicks in this range.' }] })
  }
  pushPage(first)

  let remaining = clickRows.slice(firstClicks.length)
  while (remaining.length) {
    const chunk = remaining.slice(0, laterCapacity)
    remaining = remaining.slice(chunk.length)
    const rows = [
      { y: 752, cells: [{ x: 40, text: 'Click report', size: 12 }] },
      { y: 732, rule: true, x1: 40, x2: 572 },
      { y: 716, cells: headerCells },
    ]
    let line = 698
    for (const row of chunk) {
      rows.push({ y: line, cells: row.cells })
      line -= 14
    }
    pushPage(rows)
  }

  if (report.clicks.length > 400) {
    const last = pages[pages.length - 1]
    const lowest = Math.min(...last.map((row) => row.y))
    last.push({
      y: Math.max(40, lowest - 18),
      cells: [
        {
          x: 40,
          size: 8,
          text: `Showing 400 of ${report.clicks.length} clicks. Download CSV for the full log.`,
        },
      ],
    })
  }

  const streams = pages.map((rows, index) => pageStream(rows, index, pages.length))
  const bytes = buildPdf(streams)
  downloadBlob(
    `shortly-report-${stamp()}.pdf`,
    new Blob([bytes], { type: 'application/pdf' })
  )
}
