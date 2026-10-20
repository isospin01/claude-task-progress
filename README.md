# task-progress

A Claude Code mod that shows a progress bar above the prompt while Claude works through a task list:

```
██████████░░░░░░░░░░░░░░ 2/5 · 40%  Running the tests
```

The bar counts steps completed out of steps planned, read from Claude's own task tools (TodoWrite, TaskCreate, TaskUpdate, TaskList), and shows the step in progress. It turns green when all steps are done and clears on your next request.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install task-progress --marketplace isospin01/claude-task-progress
```

From a shell:

```
claude plugin install task-progress --marketplace isospin01/claude-task-progress
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `isospin01/claude-task-progress`, then Add plugin.
