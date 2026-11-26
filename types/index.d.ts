export type Limit = { kind: string; pct: number; resetsAt?: string }
export type Live = {
  tokens: number
  window: number
  percent: number
  limits: Limit[]
  usd: number | null
}
/** [input, output, cacheWrite5m, cacheWrite1h, cacheRead, requests] */
export type Row = [number, number, number, number, number, number]
export type Days = Record<string, Record<string, Row>>
export type ScanInfo = { at: number; files: number; isRunning: boolean; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'token-board': {
      live: Live | null
      days: Shaped<Days>
      scan: ScanInfo
    }
  }
}
