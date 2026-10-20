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

test('progress tool drives the bar step by step, exactly', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await bar($)).hidden).toBe(true)

  const titles = ['Read', 'Plan', 'Edit', 'Test', 'Commit']
  for (let done = 0; done <= 5; done++) {
    const r = await $.tool.call({
      tool: TOOL,
      steps: titles.map((title, i) => ({
        title,
        status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
      })),
    } as any)
    expect(r.result).toBe(`Progress recorded: ${done}/5 steps done.`)
    expect((await bar($)).count).toBe(` ${done}/5 · ${Math.round((done / 5) * 100)}% `)
  }
})

test('the current step label and the done state', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, steps: [{ title: 'A', status: 'completed' }, { title: 'Run tests', status: 'in_progress' }] } as any)
  let ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /Run tests/ }))?.text).toBe('Run tests')
  await ui.unmount()

  await $.tool.call({ tool: TOOL, steps: [{ title: 'A', status: 'completed' }, { title: 'Run tests', status: 'completed' }] } as any)
  ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /All steps done/ }))?.text).toBe('All steps done')
  await ui.unmount()

  // The next request clears a finished list.
  await $.prompt.submit({ text: 'next thing' } as any)
  expect((await bar($)).hidden).toBe(true)
})

test('a malformed call is refused and leaves the bar as it was', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, steps: [{ title: 'A', status: 'in_progress' }, { title: 'B', status: 'pending' }] } as any)
  const bad = await $.tool.call({ tool: TOOL, steps: [{ title: 'A', status: 'done' }] } as any)
  expect(typeof bad.deny).toBe('string')
  expect((await bar($)).count).toBe(' 0/2 · 0% ')
})
