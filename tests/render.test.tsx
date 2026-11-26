import { expect, test } from 'claude-code/testing'

const today = (() => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})()

const seed = (on: any) =>
  on('state.get', (_: any, e: any) => {
    if (e.key === 'live')
      return { value: { value: { tokens: 340000, window: 1000000, percent: 34, limits: [{ kind: 'five_hour', pct: 23, resetsAt: '2026-11-26T14:00:00Z' }], usd: 1.5 }, version: 1 } }
    if (e.key === 'flash') return { value: { value: 'open', version: 1 } }
    if (e.key === 'days')
    return { value: { value: { at: 0, files: 0, isRunning: false }, version: 1 } }
  })

test('横条在桌面端显示上下文和费用', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ plugin: 'token-board', component: 'AbovePrompt', surface: 'desktop', props: { hasSurvey: false } } as any)
  expect(await ui.find({ type: 'Svg' } as any)).toBeDefined()
  expect(await ui.find({ key: 'open' })).toBeDefined()
  await ui.unmount()
})

test('面板在各端都能画出来', async ($, on) => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'token-board', component: 'Pane', requestId: 'token-board', surface,
      props: { title: 'Token 用量看板', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    } as any)
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /当前会话/ })).toBeDefined()
    else expect(await ui.find({ type: 'Svg' } as any)).toBeDefined()
    await ui.unmount()
  }
})
