import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step } from '../types'

// The main agent's task list. Fed by this mod's own `progress` tool, and by
// the built-in task tools (TodoWrite, TaskCreate/TaskUpdate/TaskList) on
// builds that have them.
const steps = atom({ plugin: 'task-progress', key: 'steps' } as const, [] as Step[])

const BAR_WIDTH = 24
const TOOL = 'mcp__task-progress__progress'
// Kept short: this text rides on every request.
const INSTRUCTIONS = `For tasks of 3+ steps, report progress with ${TOOL}: {"plan":[titles],"done":0} at the start, then {"done":N} as steps finish. Send it in parallel with your other tool calls, never alone; only the final update may go alone. Skip it for short tasks.`

type ProgressInput = { plan?: unknown; done?: unknown }

// The plan is sent once; each later call carries only the done count.
function apply(list: Step[], input: ProgressInput): Step[] | string {
  let titles = list.map(s => s.subject)
  if (input.plan !== undefined) {
    if (!Array.isArray(input.plan) || input.plan.length === 0 || !input.plan.every(t => typeof t === 'string' && t.trim() !== '')) {
      return 'plan must be a non-empty list of step titles'
    }
    titles = input.plan.map(t => String(t).trim())
  }
  if (titles.length === 0) {
    return 'send plan first'
  }
  const prevDone = list.filter(s => s.status === 'completed').length
  const done = input.done === undefined ? Math.min(prevDone, titles.length) : input.done
  if (typeof done !== 'number' || !Number.isInteger(done) || done < 0 || done > titles.length) {
    return `done must be a whole number from 0 to ${titles.length}`
  }
  return titles.map((subject, i) => ({
    id: String(i),
    subject,
    status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'progress',
      description: 'Progress bar. plan: step titles (once, or again if it changes). done: steps finished.',
      inputSchema: {
        type: 'object',
        properties: {
          plan: { type: 'array', items: { type: 'string' } },
          done: { type: 'integer', minimum: 0 },
        },
      },
      isDeferred: false,
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [...composed.sections, { id: 'task-progress:instructions', text: INSTRUCTIONS, scope: 'session' as const }],
    }
  }).catch(($, e, next) => next(e))

  // A finished list is cleared when the next prompt starts new work.
  on('prompt.submit', async ($, e, next) => {
    const list = await read($, steps)
    if (list.length > 0 && list.every(s => s.status === 'completed')) {
      await update($, steps, () => [])
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // Subagents keep their own plans; only the main agent's work drives the bar.
    if (e.agentId !== undefined) {
      return { result: 'ok' }
    }
    const next = apply(await read($, steps), e as unknown as ProgressInput)
    if (typeof next === 'string') {
      return { deny: `progress: ${next}` }
    }
    await update($, steps, () => next)
    return { result: 'ok' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError) {
      return ran
    }

    try {
      if (e.tool === 'TodoWrite') {
        await update($, steps, () =>
          e.todos.map((t, i) => ({
            id: String(i),
            subject: t.content,
            activeForm: t.activeForm,
            status: t.status,
          })),
        )
      } else if (e.tool === 'TaskCreate') {
        const created = ran.result as { task: { id: string; subject: string } }
        await update($, steps, list => [
          ...list.filter(s => s.id !== created.task.id),
          { id: created.task.id, subject: e.subject, activeForm: e.activeForm, status: 'pending' as const },
        ])
      } else if (e.tool === 'TaskUpdate') {
        const res = ran.result as { success: boolean }
        if (res.success) {
          const status = e.status
          await update($, steps, list =>
            status === 'deleted'
              ? list.filter(s => s.id !== e.taskId)
              : list.map((s): Step =>
                  s.id !== e.taskId
                    ? s
                    : {
                        ...s,
                        subject: e.subject ?? s.subject,
                        activeForm: e.activeForm ?? s.activeForm,
                        status: status ?? s.status,
                      },
                ),
          )
        }
      } else if (e.tool === 'TaskList') {
        const res = ran.result as { tasks: Array<{ id: string; subject: string; status: Step['status'] }> }
        await update($, steps, list =>
          res.tasks.map(t => ({
            id: t.id,
            subject: t.subject,
            activeForm: list.find(s => s.id === t.id)?.activeForm,
            status: t.status,
          })),
        )
      }
    } catch {
      // A tracking failure never affects the tool call itself.
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)
    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const done = list.filter(s => s.status === 'completed').length
    const total = list.length
    const pct = Math.round((done / total) * 100)
    const filled = Math.round((done / total) * BAR_WIDTH)
    const current = list.find(s => s.status === 'in_progress')
    const allDone = done === total
    const label = allDone
      ? 'All steps done'
      : current
        ? (current.activeForm ?? current.subject)
        : `Next: ${list.find(s => s.status === 'pending')?.subject ?? ''}`

    return (
      <Box>
        <Text color={allDone ? 'green' : 'cyan'}>{'█'.repeat(filled)}</Text>
        <Text dimColor>{'░'.repeat(BAR_WIDTH - filled)}</Text>
        <Text bold> {done}/{total} · {pct}% </Text>
        <Text dimColor wrap="truncate-end">{label}</Text>
      </Box>
    )
  })
}
