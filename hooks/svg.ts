// 桌面端的 SVG 绘制：Soft Bento · Lime 风格（白色大圆角卡片、单一青柠绿渐变强调、少量黑色重点卡）
import type { Limit, Live } from '../types'

export type Totals = { tokens: number; input: number; output: number; cacheRead: number; cacheWrite: number; usd: number }
export type DayBar = { label: string; usd: number; tokens: number; isToday: boolean }
export type ModelBar = { name: string; tokens: number; usd: number; reqs: number }
export type HeatCell = { tokens: number; isFuture: boolean; date: string }
export type PaneModel = {
  live: Live | null
  today: Totals
  week: Totals
  month: Totals
  all: Totals
  recent: DayBar[]
  models: ModelBar[]
  heat: HeatCell[][]
  scanText: string
}

const FONT = `'Inter','Geist','PingFang SC','Microsoft YaHei',system-ui,sans-serif`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const fmtTok = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`

  return String(Math.round(n))
}

export const fmtUsd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)

// 估算文字宽度：中日韩字符约 1 个字号宽，其他约 0.58 个字号宽
const textW = (s: string, size: number) =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.58), 0)

const STYLE = `
<style>
  .t{font-family:${FONT};fill:#111111}
  .m{font-family:${FONT};fill:#8A8D93}
  .w{font-family:${FONT};fill:#FFFFFF}
  .wm{font-family:${FONT};fill:#9A9DA3}
  .n{font-variant-numeric:tabular-nums}
  .card{fill:#FFFFFF}
  .inset{fill:#F1F2F4}
  .track{fill:#ECEDEF}
  .trackd{fill:#2A2A2E}
  .bar{fill:#D9DBDF}
  .ring{stroke:#ECEDEF}
  @media (prefers-color-scheme: dark){
    .t{fill:#F2F2F3}.m{fill:#8E9196}
    .card{fill:#1A1A1D}.inset{fill:#232327}.track{fill:#2A2A2F}.bar{fill:#3A3B40}.ring{stroke:#2A2A2F}
  }
</style>`

const DEFS = `
<defs>
  <linearGradient id="lime" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#3DC45A"/><stop offset="1" stop-color="#B8E636"/></linearGradient>
  <linearGradient id="limev" x1="0" x2="0" y1="1" y2="0"><stop offset="0" stop-color="#3DC45A"/><stop offset="1" stop-color="#B8E636"/></linearGradient>
  <filter id="sh" x="-10%" y="-20%" width="120%" height="150%">
    <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.05"/>
    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.07"/>
  </filter>
</defs>`

const doc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${STYLE}${DEFS}${body}</svg>`

const txt = (x: number, y: number, s: string, size: number, cls: string, weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" class="${cls} n">${esc(s)}</text>`

const card = (x: number, y: number, w: number, h: number, r = 22) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="card" filter="url(#sh)"/>`

const progress = (x: number, y: number, w: number, h: number, ratio: number, trackCls = 'track') => {
  const fw = Math.max(ratio > 0 ? h : 0, Math.min(w, w * ratio))

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="${trackCls}"/>` +
    (fw > 0 ? `<rect x="${x}" y="${y}" width="${fw}" height="${h}" rx="${h / 2}" fill="url(#lime)"/>` : '')
}

const dot = (x: number, y: number, pct: number) =>
  pct >= 85 ? `<circle cx="${x}" cy="${y}" r="4" fill="#FF4D4F"/>` : pct >= 60 ? `<circle cx="${x}" cy="${y}" r="4" fill="#FFA62B"/>` : ''

const ring = (cx: number, cy: number, r: number, pct: number) => {
  const c = 2 * Math.PI * r
  const len = Math.max(0, Math.min(1, pct / 100)) * c

  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="7" class="ring"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#lime)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`
}

export const limitName = (kind: string) =>
  kind === 'five_hour' ? '5 小时额度' : kind === 'seven_day' ? '本周额度' : kind === 'spend_limit' ? '消费上限' : kind

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtReset = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()

  return isToday ? `今天 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

// ───────────── 输入框上方的横条：一整张白卡，指标分段 ─────────────

export const prettyModel = (id: string) =>
  id.replace(/^claude-/, '').replace(/^([a-z]+)-(\d+)(?:-(\d+))?$/, (_, n: string, a: string, b?: string) => `${n[0]!.toUpperCase()}${n.slice(1)} ${a}${b ? `.${b}` : ''}`)

const miniRing = (cx: number, cy: number, r: number, pct: number) => {
  const c = 2 * Math.PI * r
  const len = Math.max(0, Math.min(1, pct / 100)) * c

  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="4" class="ring"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#lime)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${len} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`
}

export const bandSvg = (live: Live | null, today: Totals) => {
  const H = 58
  const y0 = 4
  const h = H - 10
  const mid = y0 + h / 2
  type Seg = { label: string; value: string; suffix: string; pct?: number }
  const segs: Seg[] = []
  const pct = live?.percent ?? 0
  segs.push({ label: '上下文', value: live ? `${pct}%` : '—', suffix: live ? `${fmtTok(live.tokens)} / ${fmtTok(live.window)}` : '等待首次回复', pct: live ? pct : undefined })
  for (const l of live?.limits ?? []) {
    segs.push({ label: l.kind === 'five_hour' ? '5 小时额度' : l.kind === 'seven_day' ? '本周额度' : limitName(l.kind), value: `${l.pct}%`, suffix: l.resetsAt ? `${fmtReset(l.resetsAt)} 重置` : '', pct: l.pct })
  }
  segs.push({ label: '本会话', value: live?.usd != null ? fmtUsd(live.usd) : '—', suffix: '' })
  segs.push({ label: '今日', value: fmtUsd(today.usd), suffix: fmtTok(today.tokens) })

  const body: string[] = []
  let x = 20
  segs.forEach((g, i) => {
    if (i > 0) {
      body.push(`<rect x="${x}" y="${y0 + 12}" width="1" height="${h - 24}" class="bar" opacity="0.6"/>`)
      x += 20
    }
    if (g.pct !== undefined) {
      body.push(miniRing(x + 13, mid, 12, g.pct))
      x += 36
    }
    const valueW = textW(g.value, 17) * 1.18
    const suffixW = g.suffix ? 8 + textW(g.suffix, 12) * 1.05 : 0
    const labelW = textW(g.label, 12)
    body.push(txt(x, mid - 5, g.label, 12, 'm', 500))
    if (g.pct !== undefined && g.pct >= 60) body.push(dot(x + labelW + 7, mid - 8, g.pct).replace('r="4"', 'r="3"'))
    body.push(txt(x, mid + 15, g.value, 17, 't', 600))
    if (g.suffix) body.push(txt(x + valueW + 8, mid + 14, g.suffix, 12, 'm'))
    x += Math.max(labelW + (g.pct !== undefined && g.pct >= 60 ? 12 : 0), valueW + suffixW) + 20
  })
  // 最后一段「看板」：和其他段同样的 图标 + 标签 + 粗体值；原生按钮透明叠在整段上负责点击
  body.push(`<rect x="${x}" y="${y0 + 12}" width="1" height="${h - 24}" class="bar" opacity="0.6"/>`)
  const slotStart = x + 1
  x += 20
  // 图标：圆底 + 三根绿色小柱
  body.push(`<circle cx="${x + 13}" cy="${mid}" r="13" class="inset"/>`)
  ;[[-6, 6], [-1, 10], [4, 14]].forEach(([dx, bh]) => {
    body.push(`<rect x="${x + 13 + dx! - 1.5}" y="${mid + 6 - bh!}" width="3.5" height="${bh}" rx="1.75" fill="url(#limev)"/>`)
  })
  x += 36
  const openLabel = '全部统计'
  const openValue = '看板 ›'
  body.push(txt(x, mid - 5, openLabel, 12, 'm', 500))
  body.push(txt(x, mid + 15, openValue, 17, 't', 600))
  x += Math.max(textW(openLabel, 12), textW(openValue, 17) * 1.05) + 22
  const slotWidth = x - slotStart
  const W = Math.ceil(x + 2)
  const bg = `<rect x="1" y="${y0}" width="${W - 2}" height="${h}" rx="${h / 2}" class="card" filter="url(#sh)"/>`

  return { source: doc(W + 2, H, bg + body.join('')), width: W + 2, height: H, slotWidth: slotWidth + 2 }
}

// ───────────── 侧边面板 ─────────────

export const paneSvg = (m: PaneModel, width: number) => {
  const W = Math.max(320, Math.min(560, Math.round(width)))
  const P = 14 // 外边距
  const G = 12 // 卡片间距
  const CW = W - P * 2
  const out: string[] = []
  let y = P

  // 1. 重点卡：上下文
  {
    const h = 128
    out.push(card(P, y, CW, h, 24))
    const l = m.live
    out.push(txt(P + 20, y + 30, '当前上下文', 12, 'm', 500))
    out.push(txt(P + CW - 20, y + 30, l ? `窗口 ${fmtTok(l.window)}` : '', 12, 'm', 500, 'end'))
    out.push(txt(P + 20, y + 76, l ? `${l.percent}%` : '—', 40, 't', 600))
    if (l) {
      out.push(txt(P + CW - 20, y + 58, `已用 ${fmtTok(l.tokens)}`, 14, 't', 600, 'end'))
      out.push(txt(P + CW - 20, y + 77, `剩余 ${fmtTok(Math.max(0, l.window - l.tokens))}`, 12, 'm', 400, 'end'))
    }
    out.push(progress(P + 20, y + 98, CW - 40, 10, (l?.percent ?? 0) / 100))
    if (l) out.push(dot(P + 20 + textW(`${l.percent}%`, 40) * 1.12 + 10, y + 50, l.percent))
    y += h + G
  }

  // 2. 额度环形卡（两列）
  const limits: Limit[] = m.live?.limits ?? []
  if (limits.length > 0) {
    const h = 96
    const cols = Math.min(2, limits.length)
    const cw = (CW - G * (cols - 1)) / cols
    limits.slice(0, 2).forEach((l, i) => {
      const x = P + i * (cw + G)
      out.push(card(x, y, cw, h))
      out.push(ring(x + 46, y + h / 2, 26, l.pct))
      out.push(txt(x + 46, y + h / 2 + 6, `${Math.round(l.pct)}%`, 15, 't', 600, 'middle'))
      out.push(txt(x + 86, y + 38, limitName(l.kind), 13, 't', 600))
      out.push(txt(x + 86, y + 60, l.resetsAt ? `${fmtReset(l.resetsAt)} 重置` : '—', 12, 'm'))
      out.push(dot(x + cw - 18, y + 18, l.pct))
    })
    y += h + G
  }

  // 3. 费用卡（两列）
  {
    const h = 88
    const cw = (CW - G) / 2
    const cells: [string, string, string][] = [
      ['本会话', m.live?.usd != null ? fmtUsd(m.live.usd) : '—', '按 API 标价估算'],
      ['今日', fmtUsd(m.today.usd), `${fmtTok(m.today.tokens)} tokens`],
    ]
    cells.forEach(([label, value, sub], i) => {
      const x = P + i * (cw + G)
      out.push(card(x, y, cw, h))
      out.push(txt(x + 18, y + 28, label, 12, 'm', 500))
      out.push(txt(x + 18, y + 60, value, 26, 't', 600))
      out.push(txt(x + 18, y + 78, sub, 11, 'm'))
    })
    y += h + G
  }

  // 4. 汇总卡
  {
    const rows: [string, Totals][] = [['近 7 天', m.week], ['近 30 天', m.month], ['全部', m.all]]
    const h = 50 + rows.length * 44 + 64
    out.push(card(P, y, CW, h, 24))
    out.push(txt(P + 18, y + 30, '用量汇总', 14, 't', 600))
    out.push(txt(P + CW / 2, y + 30, 'Token', 11, 'm', 500, 'middle'))
    out.push(txt(P + CW - 26, y + 30, '费用', 11, 'm', 500, 'end'))
    let ry = y + 48
    for (const [label, t] of rows) {
      out.push(`<rect x="${P + 12}" y="${ry}" width="${CW - 24}" height="36" rx="12" class="inset"/>`)
      out.push(txt(P + 26, ry + 23, label, 13, 'm', 500))
      out.push(txt(P + CW / 2, ry + 23, `${fmtTok(t.tokens)}`, 14, 't', 600, 'middle'))
      out.push(txt(P + CW - 26, ry + 23, fmtUsd(t.usd), 14, 't', 600, 'end'))
      ry += 44
    }
    // 近 30 天构成
    const t = m.month
    const total = Math.max(1, t.tokens)
    const segs: [string, number, string][] = [
      ['缓存读', t.cacheRead, 'url(#lime)'],
      ['缓存写', t.cacheWrite, '#111111'],
      ['输出', t.output, '#8A8D93'],
      ['输入', t.input, '#C9CBCF'],
    ]
    out.push(txt(P + 18, ry + 14, '近 30 天构成', 12, 'm', 500))
    let sx = P + 18
    const sw = CW - 36
    out.push(`<clipPath id="seg"><rect x="${sx}" y="${ry + 22}" width="${sw}" height="10" rx="5"/></clipPath><g clip-path="url(#seg)"><rect x="${sx}" y="${ry + 22}" width="${sw}" height="10" class="track"/>`)
    for (const [, v, fill] of segs) {
      const w = (v / total) * sw
      if (w > 0) out.push(`<rect x="${sx}" y="${ry + 22}" width="${w}" height="10" fill="${fill}"/>`)
      sx += w
    }
    out.push('</g>')
    let lx = P + 18
    for (const [name, v, fill] of segs) {
      const s = `${name} ${fmtTok(v)}`
      out.push(`<circle cx="${lx + 4}" cy="${ry + 46}" r="4" fill="${fill}"/>`)
      out.push(txt(lx + 12, ry + 50, s, 11, 'm'))
      lx += 12 + textW(s, 11) + 12
    }
    y += h + G
  }

  // 5. 近 14 天柱状图
  {
    const h = 196
    out.push(card(P, y, CW, h, 24))
    out.push(txt(P + 18, y + 30, '近 14 天费用', 14, 't', 600))
    const bars = [...m.recent].reverse()
    const max = Math.max(0.0001, ...bars.map(b => b.usd))
    const peak = bars.reduce((a, b) => (b.usd > a.usd ? b : a), bars[0] ?? { label: '', usd: 0, tokens: 0, isToday: false })
    out.push(txt(P + CW - 18, y + 30, `峰值 ${fmtUsd(peak.usd)} · ${peak.label}`, 12, 'm', 500, 'end'))
    const top = y + 60
    const base = y + h - 34
    const area = base - top
    const n = Math.max(1, bars.length)
    const slot = (CW - 36) / n
    const bw = Math.max(6, slot * 0.58)
    bars.forEach((b, i) => {
      const bx = P + 18 + i * slot + (slot - bw) / 2
      const bh = Math.max(4, (b.usd / max) * area)
      const isHot = b.isToday || b === peak
      out.push(`<rect x="${bx}" y="${top}" width="${bw}" height="${area}" rx="${bw / 2}" class="inset"/>`)
      out.push(`<rect x="${bx}" y="${base - bh}" width="${bw}" height="${bh}" rx="${bw / 2}" ${isHot ? 'fill="url(#limev)"' : 'class="bar"'}><title>${esc(`${b.label} ${fmtUsd(b.usd)} · ${fmtTok(b.tokens)}`)}</title></rect>`)
      if (isHot) out.push(txt(bx + bw / 2, base - bh - 6, fmtUsd(b.usd), 10, 't', 600, 'middle'))
      if (i % 2 === (n - 1) % 2) out.push(txt(bx + bw / 2, base + 20, b.label, 10, b.isToday ? 't' : 'm', b.isToday ? 600 : 400, 'middle'))
    })
    y += h + G
  }

  // 6. 按模型
  if (m.models.length > 0) {
    const rows = m.models.slice(0, 5)
    const h = 48 + rows.length * 46
    out.push(card(P, y, CW, h, 24))
    out.push(txt(P + 18, y + 30, '按模型 · 近 30 天', 14, 't', 600))
    const max = Math.max(0.0001, ...rows.map(r => r.usd))
    let ry = y + 50
    rows.forEach((r, i) => {
      out.push(txt(P + 18, ry + 14, prettyModel(r.name), 13, 't', 500))
      out.push(txt(P + CW - 18, ry + 14, `${fmtUsd(r.usd)}`, 13, 't', 600, 'end'))
      out.push(txt(P + CW - 18 - textW(fmtUsd(r.usd), 13) - 10, ry + 14, `${fmtTok(r.tokens)} · ${r.reqs} 次`, 11, 'm', 400, 'end'))
      const bw = CW - 36
      out.push(`<rect x="${P + 18}" y="${ry + 22}" width="${bw}" height="6" rx="3" class="track"/>`)
      out.push(`<rect x="${P + 18}" y="${ry + 22}" width="${Math.max(6, (r.usd / max) * bw)}" height="6" rx="3" ${i === 0 ? 'fill="url(#lime)"' : 'class="bar"'}/>`)
      ry += 46
    })
    y += h + G
  }

  // 7. 热力图（从有数据的那周开始，至少 6 周）
  {
    const all = m.heat[0]?.length ?? 0
    let first = all
    for (let w = 0; w < all; w++) if (m.heat.some(row => (row[w]?.tokens ?? 0) > 0)) { first = w; break }
    const from = Math.max(0, Math.min(first, all - 6))
    const grid = m.heat.map(row => row.slice(from))
    const weeks = grid[0]?.length ?? 0
    const labelW = 24
    const gap = 5
    const cell = Math.min(30, (CW - 36 - labelW) / Math.max(1, weeks) - gap)
    const gx = P + 18 + Math.max(0, (CW - 36 - (labelW + weeks * (cell + gap) - gap)) / 2)
    const gridTop = y + 62
    const h = 62 + 7 * (cell + gap) + 34
    out.push(card(P, y, CW, h, 24))
    out.push(txt(P + 18, y + 30, `活跃热力图 · 近 ${weeks} 周`, 14, 't', 600))
    let max = 1
    let active = 0
    for (const row of grid) for (const c of row) {
      max = Math.max(max, c.tokens)
      if (c.tokens > 0) active++
    }
    out.push(txt(P + CW - 18, y + 30, `活跃 ${active} 天`, 12, 'm', 500, 'end'))
    let lastMonth = ''
    for (let w = 0; w < weeks; w++) {
      const d = grid[0]?.[w]?.date ?? ''
      const month = d.slice(5, 7)
      if (month && month !== lastMonth) {
        out.push(txt(gx + labelW + w * (cell + gap), gridTop - 8, `${Number(month)}月`, 10, 'm', 500))
        lastMonth = month
      }
    }
    const names = ['一', '', '三', '', '五', '', '日']
    grid.forEach((row, d) => {
      const cy = gridTop + d * (cell + gap)
      if (names[d]) out.push(txt(gx, cy + cell / 2 + 4, names[d] ?? '', 10, 'm'))
      row.forEach((c, w) => {
        if (c.isFuture) return
        const cx = gx + labelW + w * (cell + gap)
        const r = c.tokens / max
        const op = c.tokens <= 0 ? 0 : r > 0.66 ? 1 : r > 0.33 ? 0.7 : r > 0.1 ? 0.45 : 0.25
        const rx = Math.min(7, cell / 3)
        out.push(`<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="${rx}" class="inset"/>`)
        if (op > 0) out.push(`<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="${rx}" fill="url(#lime)" opacity="${op}"><title>${esc(`${c.date} · ${fmtTok(c.tokens)}`)}</title></rect>`)
      })
    })
    const ly = y + h - 20
    out.push(txt(P + CW - 18 - 5 * (12 + 3) - 8, ly + 4, '少', 10, 'm', 400, 'end'))
    ;[0, 0.25, 0.45, 0.7, 1].forEach((op, i) => {
      const lx = P + CW - 18 - (5 - i) * (12 + 3)
      out.push(`<rect x="${lx}" y="${ly - 6}" width="12" height="12" rx="3" class="inset"/>`)
      if (op > 0) out.push(`<rect x="${lx}" y="${ly - 6}" width="12" height="12" rx="3" fill="url(#lime)" opacity="${op}"/>`)
    })
    out.push(txt(P + CW - 18 + 4, ly + 4, '多', 10, 'm'))
    y += h + G
  }

  // 8. 脚注
  out.push(txt(P + 4, y + 8, '费用按 API 标价估算，不是订阅的实际扣费', 11, 'm'))
  out.push(txt(P + 4, y + 26, m.scanText, 11, 'm'))
  y += 36

  return { source: doc(W, Math.ceil(y), out.join('')), width: W, height: Math.ceil(y) }
}
