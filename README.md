# task-progress

A Claude Code mod that shows a progress bar above the prompt while Claude works through a task list:

```
██████████░░░░░░░░░░░░░░ 2/5 · 40%  Running the tests
```

The mod gives Claude a small `progress` tool: it sends its plan once (`{"plan":[...],"done":0}`), then only a count as steps finish (`{"done":2}`), alongside its other tool calls so no extra requests are made. The instruction it adds is about 60 tokens. The bar counts steps completed out of steps planned and shows the step in progress. On Claude Code builds that have the built-in task tools (TodoWrite, TaskCreate, TaskUpdate, TaskList), it follows those too. It turns green when all steps are done and clears on your next request.

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
