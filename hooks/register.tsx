import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step } from '../types'

// The main agent's task list, mirrored from the task tools' own results.
const steps = atom({ plugin: 'task-progress', key: 'steps' } as const, [] as Step[])

const BAR_WIDTH = 24

export const register: Register = on => {
  // A finished list is cleared when the next prompt starts new work.
  on('prompt.submit', async ($, e, next) => {
    const list = await read($, steps)
    if (list.length > 0 && list.every(s => s.status === 'completed')) {
      await update($, steps, () => [])
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    // Subagents keep their own lists; only the main agent's work is tracked.
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
