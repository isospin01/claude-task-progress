import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'task-progress',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

const TOOL = 'mcp__task-progress__progress'

function engine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

async function bar($: any) {
  const ui = await $.ui.mount(BAND)
  const count = (await ui.find({ type: 'Text', text: /\d+\/\d+ ·/ }))?.text
  const engineText = (await ui.find({ type: 'Text', text: /^engine$/ }))?.text
  await ui.unmount()
  return { count, hidden: engineText === 'engine' }
}

test('plan once, then done counts drive the bar exactly', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await bar($)).hidden).toBe(true)

  const r = await $.tool.call({ tool: TOOL, plan: ['Read', 'Plan', 'Edit', 'Test', 'Commit'], done: 0 } as any)
  expect(r.result).toBe('ok')
  expect((await bar($)).count).toBe(' 0/5 · 0% ')
  for (let done = 1; done <= 5; done++) {
    await $.tool.call({ tool: TOOL, done } as any)
    expect((await bar($)).count).toBe(` ${done}/5 · ${Math.round((done / 5) * 100)}% `)
  }
})

test('the current step label, a changed plan, and the done state', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, plan: ['A', 'Run tests'], done: 1 } as any)
  let ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /Run tests/ }))?.text).toBe('Run tests')
  await ui.unmount()

  // A step discovered midway: the plan is resent and the done count kept.
  await $.tool.call({ tool: TOOL, plan: ['A', 'Run tests', 'Fix lint'] } as any)
  expect((await bar($)).count).toBe(' 1/3 · 33% ')

  await $.tool.call({ tool: TOOL, done: 3 } as any)
  ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /All steps done/ }))?.text).toBe('All steps done')
  await ui.unmount()

  // The next request clears a finished list.
  await $.prompt.submit({ text: 'next thing' } as any)
  expect((await bar($)).hidden).toBe(true)
})

test('bad calls are refused and leave the bar as it was', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(typeof (await $.tool.call({ tool: TOOL, done: 1 } as any)).deny).toBe('string')
  await $.tool.call({ tool: TOOL, plan: ['A', 'B'], done: 0 } as any)
  expect(typeof (await $.tool.call({ tool: TOOL, done: 5 } as any)).deny).toBe('string')
  expect(typeof (await $.tool.call({ tool: TOOL, plan: [] } as any)).deny).toBe('string')
  expect((await bar($)).count).toBe(' 0/2 · 0% ')
})
