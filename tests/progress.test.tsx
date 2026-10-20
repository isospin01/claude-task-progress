import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'task-progress',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('the bar follows TodoWrite: 1 of 3 done, current step shown', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read code', status: 'completed', activeForm: 'Reading code' },
      { content: 'Write fix', status: 'in_progress', activeForm: 'Writing the fix' },
      { content: 'Run tests', status: 'pending', activeForm: 'Running tests' },
    ],
  })

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /1\/3/ }))?.text).toBe(' 1/3 · 33% ')
  expect((await ui.find({ type: 'Text', text: /Writing/ }))?.text).toBe('Writing the fix')
  await ui.unmount()
})

test('the bar follows TaskCreate/TaskUpdate and hides when empty', async ($, on) => {
  let n = 0
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: String(++n), subject: e.subject } } }
      : { result: { success: true, taskId: 'x', updatedFields: [] } },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  let ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()

  await $.tool.call({ tool: 'TaskCreate', subject: 'A', description: 'a' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'B', description: 'b', activeForm: 'Doing B' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

  ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /\d\/\d/ }))?.text).toBe(' 1/2 · 50% ')
  expect((await ui.find({ type: 'Text', text: /Doing B/ }))?.text).toBe('Doing B')
  await ui.unmount()
})
