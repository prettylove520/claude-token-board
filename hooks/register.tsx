import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Days, Limit, Live, Row, ScanInfo } from '../types'

import { bandSvg, paneSvg } from './svg'
import type { PaneModel } from './svg'

const P = 'token-board'
const PANE = 'token-board'
const TITLE = 'Token 用量看板'

const live = atom({ plugin: 'token-board', key: 'live' } as const, null as Live | null)
const days = atom({ plugin: 'token-board', key: 'days' } as const, {} as Days, { shape: 'days-1' })
const scan = atom({ plugin: 'token-board', key: 'scan' } as const, { at: 0, files: 0, isRunning: false } as ScanInfo)

// 每百万 token 美元：[输入, 输出, 缓存写5m, 缓存写1h, 缓存读]（API 标价，2026-11）
const PRICES: Record<string, [number, number, number, number, number]> = {
  fable: [8, 40, 10, 16, 0.2],
  mythos: [8, 40, 10, 16, 0.2],
  opus: [4, 20, 5, 8, 0.2],
  sonnet: [2, 10, 2.5, 4, 0.1],
  haiku: [0.1, 0.5, 0.125, 0.2, 0.01],
}

const priceOf = (model: string) => {
  const family = Object.keys(PRICES).find(name => model.includes(name))

  return family ? PRICES[family] : undefined
}

const costOf = (model: string, r: Row) => {
  const p = priceOf(model)
  if (!p) return 0

  return (r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3] * p[3] + r[4] * p[4]) / 1e6
}

const CHUNK = 4 * 1024 * 1024 - 1024
const MAX_SEEN = 80000

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const utf8Length = (text: string) => {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4
      i++
    } else n += 3
  }

  return n
}

const colWidth = (text: string) => [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
const padL = (text: string, w: number) => ' '.repeat(Math.max(0, w - colWidth(text))) + text
const padR = (text: string, w: number) => text + ' '.repeat(Math.max(0, w - colWidth(text)))

const fmtTok = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`

  return String(Math.round(n))
}

const fmtUsd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`)

const bar = (ratio: number, width: number) => {
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)))

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const fmtReset = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  return dayKey(d) === dayKey(now) ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

const limitName = (kind: string) =>
  kind === 'five_hour' ? '5小时' : kind === 'seven_day' ? '本周' : kind === 'spend_limit' ? '消费上限' : kind

type Sum = { tokens: number; input: number; output: number; cacheRead: number; cacheWrite: number; usd: number; reqs: number }

const emptySum = (): Sum => ({ tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0, reqs: 0 })

const addRow = (s: Sum, model: string, r: Row) => {
  s.input += r[0]
  s.output += r[1]
  s.cacheWrite += r[2] + r[3]
  s.cacheRead += r[4]
  s.tokens += r[0] + r[1] + r[2] + r[3] + r[4]
  s.reqs += r[5]
  s.usd += costOf(model, r)
}

const sumDays = (all: Days, keys: string[]) => {
  const s = emptySum()
  for (const k of keys) {
    const byModel = all[k]
    if (!byModel) continue
    for (const [model, r] of Object.entries(byModel)) addRow(s, model, r)
  }

  return s
}

const lastDays = (n: number) => {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d))
    d.setDate(d.getDate() - 1)
  }

  return out
}

let projectsDir = ''
let isScanning = false
let offsets: Record<string, number> = {}
let seen: string[] = []
let seenSet = new Set<string>()
let isLoaded = false

const loadIndex = async ($: any) => {
  if (isLoaded) return
  offsets = ((await $.store.get('offsets')) as Record<string, number>) ?? {}
  seen = ((await $.store.get('seen')) as string[]) ?? []
  seenSet = new Set(seen)
  const saved = (await $.store.get('days')) as Days | undefined
  if (saved) await update($, days, () => saved)
  isLoaded = true
}

const listFiles = async ($: any, dir: string, depth: number, out: { path: string; size: number }[]) => {
  const entries = await $.fs.list(dir).catch(() => [])
  for (const e of entries) {
    const path = `${dir}/${e.name}`
    if (e.kind === 'dir' && depth > 0) await listFiles($, path, depth - 1, out)
    else if (e.kind === 'file' && e.name.endsWith('.jsonl')) out.push({ path, size: e.size })
  }
}

const ingest = (text: string, acc: Days) => {
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue
    let rec: any
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    const msg = rec?.message
    const u = msg?.usage
    const model: string = msg?.model ?? ''
    if (!u || !model || model.startsWith('<')) continue
    const key = `${msg.id ?? ''}|${rec.requestId ?? ''}`
    if (seenSet.has(key)) continue
    seenSet.add(key)
    seen.push(key)
    const ts = new Date(rec.timestamp ?? Date.now())
    const day = dayKey(ts)
    const cw5 = u.cache_creation?.ephemeral_5m_input_tokens ?? (u.cache_creation ? 0 : u.cache_creation_input_tokens ?? 0)
    const cw1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
    const byModel = (acc[day] ??= {})
    const r = (byModel[model] ??= [0, 0, 0, 0, 0, 0])
    r[0] += u.input_tokens ?? 0
    r[1] += u.output_tokens ?? 0
    r[2] += cw5
    r[3] += cw1
    r[4] += u.cache_read_input_tokens ?? 0
    r[5] += 1
  }
}

const runScan = async ($: any) => {
  if (isScanning || !projectsDir) return
  isScanning = true
  await update($, scan, s => ({ ...s, isRunning: true }))
  try {
    await loadIndex($)
    const files: { path: string; size: number }[] = []
    await listFiles($, projectsDir, 3, files)
    const acc: Days = JSON.parse(JSON.stringify(await read($, days)))
    let changed = false
    for (const f of files) {
      let offset = offsets[f.path] ?? 0
      if (f.size < offset) offset = 0
      while (offset < f.size) {
        const length = Math.min(CHUNK, f.size - offset)
        const text: string = await $.fs.read(f.path, { offset, length })
        const cut = text.lastIndexOf('\n')
        if (cut < 0) break
        const whole = text.slice(0, cut + 1)
        ingest(whole, acc)
        offset += utf8Length(whole)
        changed = true
      }
      offsets[f.path] = offset
    }
    if (seen.length > MAX_SEEN) {
      seen = seen.slice(-MAX_SEEN)
      seenSet = new Set(seen)
    }
    if (changed) {
      await update($, days, () => acc)
      await $.store.set('days', acc)
      await $.store.set('seen', seen)
    }
    await $.store.set('offsets', offsets)
    await update($, scan, () => ({ at: Date.now(), files: files.length, isRunning: false }))
  } catch (err) {
    await update($, scan, s => ({ ...s, isRunning: false, error: String(err) }))
  } finally {
    isScanning = false
  }
}

const setLive = async ($: any, u: { context: any; rateLimits: any[]; cost?: { usd: number } }) => {
  const value: Live = {
    tokens: u.context?.tokens ?? 0,
    window: u.context?.window ?? 0,
    percent: u.context?.percent ?? 0,
    limits: (u.rateLimits ?? []).map((l: any): Limit => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt })),
    usd: u.cost?.usd ?? null,
  }
  await update($, live, () => value)
}

const openPane = ($: any) => $.ui.open({ id: PANE, title: TITLE })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'token-board', description: '打开 Token 用量看板' })
    const info = await $.session.info()
    const path = info.transcriptPath.replace(/\\/g, '/')
    const at = path.lastIndexOf('/projects/')
    projectsDir = at >= 0 ? path.slice(0, at + '/projects'.length) : ''
    void $.session.usage().then(u => setLive($, u)).catch(() => undefined)
    void runScan($)
    $.clock.every(60_000, () => void runScan($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await setLive($, e)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void runScan($)

    return next(e)
  })

  on('command.run', { command: 'token-board' }, async $ => {
    await openPane($)

    return { text: '已打开 Token 用量看板。' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const l = await read($, live)
    const all = await read($, days)
    const { Box, Text, Button } = $.ui.resolve(e)
    const today = sumDays(all, [dayKey(new Date())])
    const pct = l?.percent ?? 0
    const ctxColor = pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'success'

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e) as any
      const band = bandSvg(l, today)

      return (
        <Box flexDirection="row">
          <Box position="relative">
            <Svg source={band.source} alt={`上下文 ${pct}%，今日 ${fmtUsd(today.usd)}`} />
            <Box position="absolute" right={0} top={0} bottom={0} width={Math.round(band.slotWidth / 7.2)} justifyContent="center" alignItems="center">
              {/* 文字由 SVG 画；按钮用空白盲文字符占位，只负责点击 */}
              <Button key="open" label={'⠀'.repeat(Math.max(4, Math.round(band.slotWidth / 12)))} plain onPress={() => void openPane($)} />
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text dimColor>上下文</Text>
        <Text color={ctxColor} tabular>
          {l ? `${pct}% · ${fmtTok(l.tokens)}/${fmtTok(l.window)}` : '—'}
        </Text>
        {(l?.limits ?? []).map(x => (
          <Text key={x.kind} tabular>
            <Text dimColor>｜{limitName(x.kind)} </Text>
            <Text color={x.pct >= 85 ? 'error' : x.pct >= 60 ? 'warning' : undefined}>{x.pct}%</Text>
            {x.resetsAt ? <Text dimColor> {fmtReset(x.resetsAt)}重置</Text> : null}
          </Text>
        ))}
        <Text tabular>
          <Text dimColor>｜本会话 </Text>
          {l?.usd != null ? fmtUsd(l.usd) : '—'}
          <Text dimColor>｜今日 </Text>
          {fmtTok(today.tokens)} · {fmtUsd(today.usd)}
        </Text>
        <Button key="open" label="打开用量看板" variant="primary" onPress={() => void openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const l = await read($, live)
    const all = await read($, days)
    const s = await read($, scan)
    const width = Math.max(20, Math.min(60, (e.viewport?.columns ?? 60) - 4))

    const heading = (t: string) => (
      <Text weight="semibold" size="heading">
        {t}
      </Text>
    )

    const periods: [string, string[]][] = [
      ['今日', lastDays(1)],
      ['近 7 天', lastDays(7)],
      ['近 30 天', lastDays(30)],
      ['全部', Object.keys(all)],
    ]

    const recent = lastDays(14)
    const recentSums = recent.map(k => ({ k, s: sumDays(all, [k]) }))
    const maxUsd = Math.max(0.0001, ...recentSums.map(x => x.s.usd))

    const models: Record<string, Sum> = {}
    for (const k of lastDays(30)) {
      for (const [m, r] of Object.entries(all[k] ?? {})) addRow((models[m] ??= emptySum()), m, r)
    }
    const modelRows = Object.entries(models).sort((a, b) => b[1].usd - a[1].usd)

    // 热力图：近 12 周，每列一周，行是周一到周日
    const weeks = 12
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7)
    const grid: { k: string; tok: number; isFuture: boolean }[][] = Array.from({ length: 7 }, () => [])
    const cursor = new Date(start)
    let maxTok = 1
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const k = dayKey(cursor)
        const tok = sumDays(all, [k]).tokens
        maxTok = Math.max(maxTok, tok)
        grid[d]!.push({ k, tok, isFuture: cursor > end })
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    const heat = (tok: number) => {
      if (tok <= 0) return 'subtle'
      const r = tok / maxTok

      return r > 0.75 ? '#216e39' : r > 0.5 ? '#30a14e' : r > 0.25 ? '#40c463' : '#9be9a8'
    }
    const weekNames = ['一', '二', '三', '四', '五', '六', '日']

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e) as any
      const today = dayKey(new Date())
      const model: PaneModel = {
        live: l,
        today: sumDays(all, lastDays(1)),
        week: sumDays(all, lastDays(7)),
        month: sumDays(all, lastDays(30)),
        all: sumDays(all, Object.keys(all)),
        recent: recentSums.map(({ k, s: x }) => ({ label: `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`, usd: x.usd, tokens: x.tokens, isToday: k === today })),
        models: modelRows.map(([m, x]) => ({ name: m, tokens: x.tokens, usd: x.usd, reqs: x.reqs })),
        heat: grid.map(row => row.map(c => ({ tokens: c.tok, isFuture: c.isFuture, date: c.k }))),
        scanText: s.isRunning ? '正在扫描本机日志…' : s.at ? `${s.files} 个日志 · ${fmtReset(new Date(s.at).toISOString())} 更新 · 每分钟自动刷新` : '尚未扫描',
      }
      const pane = paneSvg(model, 460)

      return (
        <Box flexDirection="column" gap="md">
          <Svg source={pane.source} alt="Token 用量看板" />
          {s.error ? <Text color="error">扫描出错：{s.error}</Text> : null}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="column">
          {heading('当前会话')}
          {l ? (
            <Box flexDirection="column">
              <Text tabular>
                上下文 <Text color={l.percent >= 85 ? 'error' : l.percent >= 60 ? 'warning' : 'success'}>{bar(l.percent / 100, 20)}</Text> {l.percent}%
              </Text>
              <Text dimColor tabular>
                已用 {fmtTok(l.tokens)} / 窗口 {fmtTok(l.window)}，剩余 {fmtTok(Math.max(0, l.window - l.tokens))}
              </Text>
              {l.limits.length === 0 ? <Text dimColor>额度：暂无读数（订阅账号在首次回复后显示）</Text> : null}
              {l.limits.map(x => (
                <Text key={x.kind} tabular>
                  {padR(limitName(x.kind), 8)} <Text color={x.pct >= 85 ? 'error' : x.pct >= 60 ? 'warning' : 'success'}>{bar(x.pct / 100, 20)}</Text> {x.pct}%
                  {x.resetsAt ? <Text dimColor>  {fmtReset(x.resetsAt)} 重置</Text> : null}
                </Text>
              ))}
              <Text tabular>本会话费用 {l.usd != null ? fmtUsd(l.usd) : '—'}</Text>
            </Box>
          ) : (
            <Text dimColor>等待第一次回复后显示。</Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('汇总')}
          <Text dimColor tabular mono>
            {padR('时段', 9)}{['总量', '输入', '输出', '缓存读', '缓存写', '费用'].map(t => padL(t, 9)).join('')}
          </Text>
          {periods.map(([name, keys]) => {
            const x = sumDays(all, keys)

            return (
              <Text key={name} tabular mono>
                {padR(name, 9)}
                {padL(fmtTok(x.tokens), 9)}
                {padL(fmtTok(x.input), 9)}
                {padL(fmtTok(x.output), 9)}
                {padL(fmtTok(x.cacheRead), 9)}
                {padL(fmtTok(x.cacheWrite), 9)}
                {padL(fmtUsd(x.usd), 9)}
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="column">
          {heading('近 14 天（按费用）')}
          {recentSums.map(({ k, s: x }) => (
            <Text key={k} tabular mono>
              {k.slice(5)} <Text color="claude">{bar(x.usd / maxUsd, Math.max(8, width - 26))}</Text> {fmtUsd(x.usd).padStart(7)} {fmtTok(x.tokens).padStart(7)}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('按模型（近 30 天）')}
          {modelRows.length === 0 ? <Text dimColor>暂无数据</Text> : null}
          {modelRows.map(([m, x]) => (
            <Text key={m} tabular mono>
              {m.replace(/^claude-/, '').padEnd(14)} {fmtTok(x.tokens).padStart(8)} {String(x.reqs).padStart(6)}次 {fmtUsd(x.usd).padStart(8)}
              {priceOf(m) ? '' : <Text dimColor> 未知价格</Text>}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('活跃热力图（近 12 周）')}
          {grid.map((row, d) => (
            <Box key={`w${d}`} flexDirection="row">
              <Text dimColor>{weekNames[d]} </Text>
              {row.map(c => (
                <Text key={c.k} color={c.isFuture ? undefined : heat(c.tok)}>
                  {c.isFuture ? '  ' : '■ '}
                </Text>
              ))}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text dimColor>
            费用按 API 标价估算，不是订阅的实际扣费。数据来自本机 ~/.claude/projects，含子代理。
          </Text>
          <Text dimColor>
            {s.isRunning ? '正在扫描…' : s.at ? `已扫描 ${s.files} 个日志 · ${fmtReset(new Date(s.at).toISOString())} 更新` : '尚未扫描'}
            {s.error ? ` · 出错：${s.error}` : ''}
          </Text>
          <Box flexDirection="row" gap={1}>
            <Button key="rescan" label="立即刷新" onPress={() => void runScan($)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
