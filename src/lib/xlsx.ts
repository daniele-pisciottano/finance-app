import { unzipSync, strFromU8 } from 'fflate'

// Minimal read-only .xlsx parser (no heavy dependency). Returns a 2D grid of cells;
// numbers stay numbers (dates are Excel serials — convert with excelSerialToDate).
export type Cell = string | number | null

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

function colNum(ref: string): number {
  let n = 0
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function readXlsx(data: Uint8Array): Cell[][] {
  const files = unzipSync(data)

  const shared: string[] = []
  const ss = files['xl/sharedStrings.xml']
  if (ss) {
    const xml = strFromU8(ss)
    for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      let s = ''
      for (const t of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1])
      shared.push(s)
    }
  }

  const sheetKey = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0]
  if (!sheetKey) return []

  const xml = strFromU8(files[sheetKey])
  const rows: Cell[][] = []
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowArr: Cell[] = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*)\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] + cm[3]
      const ref = cm[2]
      const inner = cm[4] || ''
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1] || ''
      let val: Cell = null
      if (t === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
        val = v ? shared[parseInt(v[1], 10)] ?? '' : ''
      } else if (t === 'inlineStr' || t === 'str') {
        let s = ''
        for (const tt of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(tt[1])
        if (!s) {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
          s = v ? decodeXml(v[1]) : ''
        }
        val = s
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
        val = v ? Number(v[1]) : null
      }
      rowArr[colNum(ref)] = val
    }
    rows.push(rowArr)
  }
  return rows
}

// Excel serial date (1900 system) -> 'YYYY-MM-DD'. Excel epoch is 1899-12-30.
export function excelSerialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
