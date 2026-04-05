// lib/generate/report.ts
// Parses Mailchimp CSV and generates two Excel workbooks:
//   - Internal: full scoring, priority coloring, 3 sheets
//   - External: KPI summary + contact list without scores, 2 sheets

import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { filterAndScore, type ScoredContact } from './scoring'

export interface ReportParams {
  csvText: string
  manufacturerName: string
  agencyName: string
  campaignTitle: string
  campaignDate: string // YYYY-MM-DD
}

export interface ReportBuffers {
  internalBuffer: Buffer
  externalBuffer: Buffer
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function findCol(row: Record<string, string>, ...candidates: string[]): string {
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/[\s_]/g, '')
    for (const c of candidates) {
      if (normalized === c.toLowerCase().replace(/[\s_]/g, '')) return row[key] ?? ''
    }
  }
  return ''
}

function parseContacts(csvText: string) {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  })
  return data
    .map((row) => ({
      email: findCol(row, 'email address', 'email_address', 'email'),
      firstName: findCol(row, 'first name', 'first_name', 'firstname'),
      lastName: findCol(row, 'last name', 'last_name', 'lastname'),
      phone: findCol(row, 'phone number', 'phone_number', 'phone') || null,
      opens: parseInt(findCol(row, 'opens') || '0', 10) || 0,
      clicks: parseInt(findCol(row, 'clicks') || '0', 10) || 0,
    }))
    .filter((c) => c.email)
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function applyFont(cell: ExcelJS.Cell, overrides: Partial<ExcelJS.Font> = {}) {
  cell.font = { name: 'Arial', size: 10, ...overrides }
}

function setFill(cell: ExcelJS.Cell, hex: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex.replace('#', '') } }
}

// ─── Internal report ─────────────────────────────────────────────────────────

async function buildInternal(
  contacts: ScoredContact[],
  p: Omit<ReportParams, 'csvText'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Sheet 1: Lead-Priorisierung ──────────────────────────────────────────
  const ws1 = wb.addWorksheet('Lead-Priorisierung')
  ws1.columns = [
    { key: 'nr',       width: 6  },
    { key: 'prio',     width: 13 },
    { key: 'name',     width: 26 },
    { key: 'email',    width: 36 },
    { key: 'phone',    width: 18 },
    { key: 'opens',    width: 8  },
    { key: 'clicks',   width: 8  },
    { key: 'mailtype', width: 16 },
  ]

  // Row 1: Manufacturer
  ws1.mergeCells('A1:H1')
  const r1 = ws1.getRow(1)
  r1.getCell(1).value = p.manufacturerName.toUpperCase()
  r1.getCell(1).font = { name: 'Arial', bold: true, size: 18 }
  r1.height = 28

  // Row 2: Campaign
  ws1.mergeCells('A2:H2')
  ws1.getRow(2).getCell(1).value = p.campaignTitle
  applyFont(ws1.getRow(2).getCell(1), { size: 11 })

  // Row 3: Meta
  ws1.mergeCells('A3:H3')
  ws1.getRow(3).getCell(1).value =
    `Erstellt: ${p.campaignDate} · Datenquelle: Mailchimp-Export · Filter: Score > 3 Opens`
  applyFont(ws1.getRow(3).getCell(1), { size: 9, color: { argb: 'FF999999' } })

  // Row 4: Confidentiality hint
  ws1.mergeCells('A4:H4')
  const r4cell = ws1.getRow(4).getCell(1)
  r4cell.value = 'Interne Auswertung — Nicht zur Weitergabe an Kunden'
  applyFont(r4cell, { size: 9, italic: true, color: { argb: 'FF555555' } })
  setFill(r4cell, '#F5F3F0')

  // Row 5: Empty spacer
  ws1.addRow([])

  // Row 6: Header
  const headerRow = ws1.addRow(['Nr.', 'Priorität', 'Kontakt', 'E-Mail-Adresse', 'Telefon', 'Opens', 'Clicks', 'Mail-Typ'])
  headerRow.eachCell((cell) => {
    applyFont(cell, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(cell, '#2C2C2C')
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false }
  })
  headerRow.height = 20

  // Freeze + autofilter
  ws1.views = [{ state: 'frozen', ySplit: 6, xSplit: 0 }]
  ws1.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 8 } }

  // Data rows
  contacts.forEach((c, i) => {
    const bg = c.priority === 'A' ? '#EDE8E3' : c.priority === 'B' ? '#F5F3F0' : '#FFFFFF'
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ')
    const dataRow = ws1.addRow([
      i + 1,
      `${c.priority}`,
      name,
      c.email,
      c.phone ?? '—',
      c.opens,
      c.clicks,
      c.mailType,
    ])

    dataRow.eachCell((cell) => {
      applyFont(cell)
      setFill(cell, bg)
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
    })

    // Priority: bold
    applyFont(dataRow.getCell(2), { bold: true })

    // Email: blue
    applyFont(dataRow.getCell(4), { color: { argb: 'FF4A6FA5' } })

    // Phone: gray if empty
    if (!c.phone) applyFont(dataRow.getCell(5), { color: { argb: 'FFBBBBBB' } })

    // Mail-type color
    const mtColor = c.mailType === 'Persönlich' ? 'FF2E7D32' : 'FF999999'
    applyFont(dataRow.getCell(8), { color: { argb: mtColor } })
  })

  // ── Sheet 2: Auswertung ──────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Auswertung')
  ws2.columns = [{ width: 30 }, { width: 12 }, { width: 12 }]
  ws2.addRow(['Kategorie', 'Anzahl', 'Anteil']).eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })
  const total = contacts.length
  for (const prio of ['A', 'B', 'C'] as const) {
    const count = contacts.filter((c) => c.priority === prio).length
    ws2.addRow([
      `Priorität ${prio}`,
      count,
      total > 0 ? `${Math.round((count / total) * 100)} %` : '—',
    ])
  }
  ws2.addRow([])
  ws2.addRow(['Mail-Typ', 'Anzahl', '']).eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })
  const personal = contacts.filter((c) => c.mailType === 'Persönlich').length
  ws2.addRow(['Persönlich', personal, ''])
  ws2.addRow(['Info-Adresse', total - personal, ''])

  // ── Sheet 3: Methodik ────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Methodik')
  ws3.columns = [{ width: 30 }, { width: 60 }]
  const meta: [string, string][] = [
    ['Scoring-Formel', 'Score = (Clicks × 3) + (Opens × 1) + Mail-Typ-Bonus'],
    ['Mail-Typ-Bonus', '+2 für persönliche Adressen (nicht: info@, office@, kontakt@, contact@, mail@)'],
    ['Priorität A', 'Score ≥ 8 ODER (≥ 1 Click UND persönliche Mail)'],
    ['Priorität B', 'Score ≥ 5 ODER Opens ≥ 4'],
    ['Priorität C', 'Alle übrigen qualifizierten Kontakte'],
    ['Ausschluss', '≤ 3 Opens UND 0 Clicks'],
    ['Kontakt-Limit', 'Max. 30 Kontakte; zusätzliche Clicker immer aufgeführt'],
    ['Sortierung', 'Score absteigend → Clicks → Opens'],
    ['Hersteller', p.manufacturerName],
    ['Kampagne', p.campaignTitle],
    ['Erstellt', p.campaignDate],
  ]
  ws3.addRow(['Feld', 'Wert']).eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })
  for (const [k, v] of meta) {
    const row = ws3.addRow([k, v])
    row.eachCell((c) => applyFont(c))
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─── External report ──────────────────────────────────────────────────────────

async function buildExternal(
  contacts: ScoredContact[],
  p: Omit<ReportParams, 'csvText'>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // ── Sheet 1: Kampagnenübersicht ──────────────────────────────────────────
  const ws1 = wb.addWorksheet('Kampagnenübersicht')
  ws1.columns = [{ width: 35 }, { width: 20 }]

  ws1.mergeCells('A1:B1')
  ws1.getRow(1).getCell(1).value = p.manufacturerName.toUpperCase()
  ws1.getRow(1).getCell(1).font = { name: 'Arial', bold: true, size: 18 }

  ws1.mergeCells('A2:B2')
  ws1.getRow(2).getCell(1).value = `Kampagnenauswertung · ${p.campaignTitle}`
  applyFont(ws1.getRow(2).getCell(1), { size: 11 })

  ws1.mergeCells('A3:B3')
  ws1.getRow(3).getCell(1).value = `Erstellt von ${p.agencyName} · ${p.campaignDate}`
  applyFont(ws1.getRow(3).getCell(1), { size: 9, color: { argb: 'FF999999' } })

  ws1.addRow([])

  // KPI block
  const personal = contacts.filter((c) => c.mailType === 'Persönlich').length
  const topLeads = contacts.filter((c) => c.priority === 'A' || c.priority === 'B').length
  const kpis: [string, string | number][] = [
    ['Kontakte mit Interaktion', contacts.length],
    ['Identifizierte Entscheider', `${personal} direkte Ansprechpartner erreicht`],
    ['Kontakte mit erhöhtem Interesse', `${topLeads} Kontakte qualifiziert`],
    ['Kampagne', p.campaignTitle],
  ]
  for (const [label, value] of kpis) {
    const row = ws1.addRow([label, value])
    setFill(row.getCell(1), '#F9F7F4')
    setFill(row.getCell(2), '#F9F7F4')
    applyFont(row.getCell(1))
    applyFont(row.getCell(2), { bold: true })
    row.height = 22
  }

  // ── Sheet 2: Erreichte Kontakte ──────────────────────────────────────────
  const ws2 = wb.addWorksheet('Erreichte Kontakte')
  ws2.columns = [{ width: 6 }, { width: 28 }, { width: 36 }]

  const headerRow = ws2.addRow(['Nr.', 'Kontakt', 'E-Mail-Adresse'])
  headerRow.eachCell((c) => {
    applyFont(c, { bold: true, color: { argb: 'FFFFFFFF' } })
    setFill(c, '#2C2C2C')
  })

  // Alphabetical sort by full name (no score ordering revealed)
  const sorted = [...contacts]
    .slice(0, 30)
    .sort((a, b) => {
      const nameA = [a.lastName, a.firstName].filter(Boolean).join(' ').toLowerCase()
      const nameB = [b.lastName, b.firstName].filter(Boolean).join(' ').toLowerCase()
      return nameA.localeCompare(nameB, 'de')
    })

  sorted.forEach((c, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F9F7F4'
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ')
    const row = ws2.addRow([i + 1, name, c.email])
    row.eachCell((cell) => {
      applyFont(cell)
      setFill(cell, bg)
    })
    applyFont(row.getCell(3), { color: { argb: 'FF4A6FA5' } })
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateReports(params: ReportParams): Promise<ReportBuffers> {
  const contacts = parseContacts(params.csvText)
  const scored = filterAndScore(contacts)
  const base = {
    manufacturerName: params.manufacturerName,
    agencyName: params.agencyName,
    campaignTitle: params.campaignTitle,
    campaignDate: params.campaignDate,
  }
  const [internalBuffer, externalBuffer] = await Promise.all([
    buildInternal(scored, base),
    buildExternal(scored, base),
  ])
  return { internalBuffer, externalBuffer }
}
