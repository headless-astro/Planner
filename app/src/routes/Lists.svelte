<script lang="ts">
  import PlansNav from '../components/PlansNav.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { TaskList } from '../lib/db'
  import { linkParts, safeLink } from '../lib/links'
  import { live } from '../lib/live.svelte'
  import {
    addList,
    addTask,
    deleteList,
    deleteTask,
    dueLabel,
    getListTasks,
    listLists,
    setTaskDone,
    updateList,
    moveTaskToList,
    updateTask,
    type ListTasks,
  } from '../lib/tasks'

  let { today }: { today: string } = $props()

  const lists = live(() => listLists, [] as TaskList[])
  let selectedId = $state<string | null>(null)
  const selected = $derived(lists.current.find((list) => list.id === selectedId) ?? lists.current[0] ?? null)
  const tasks = live(
    () => {
      const listId = selected?.id ?? null
      return () => (listId ? getListTasks(listId) : Promise.resolve({ open: [], archived: [] }))
    },
    { open: [], archived: [] } as ListTasks,
  )

  let newTask = $state('')
  let newTaskDue = $state('')
  let newList = $state('')
  let addingList = $state(false)
  let subtaskDrafts = $state<Record<string, string>>({})

  const confirmDelete = (name: string) => window.confirm(`Delete "${name}"?`)

  async function submitTask(event: SubmitEvent) {
    event.preventDefault()
    const title = newTask.trim()
    if (!title || !selected) return
    await addTask(selected.id, title, { due: newTaskDue || null })
    newTask = ''
    newTaskDue = ''
  }

  async function submitSubtask(event: SubmitEvent, parentId: string) {
    event.preventDefault()
    const title = (subtaskDrafts[parentId] ?? '').trim()
    if (!title || !selected) return
    await addTask(selected.id, title, { parentId })
    subtaskDrafts[parentId] = ''
  }

  async function submitList(event: SubmitEvent) {
    event.preventDefault()
    const name = newList.trim()
    if (!name) return
    selectedId = await addList(name)
    newList = ''
    addingList = false
  }

  async function removeList(list: TaskList) {
    if (!confirmDelete(list.name)) return
    await deleteList(list.id)
    selectedId = null
  }
</script>

<PlansNav current="lists" />

<header>
  <h1>Lists</h1>
  <p class="date">Tasks and projects, with deadlines, subtasks and notes. Done ones move to the archive.</p>
</header>

<div class="chips list-tabs">
  {#each lists.current as list (list.id)}
    <button type="button" class="chip" aria-pressed={selected?.id === list.id} onclick={() => (selectedId = list.id)}>{list.name}</button>
  {/each}
  <button type="button" class="chip" aria-expanded={addingList} onclick={() => (addingList = !addingList)}>+ New list</button>
</div>

{#if addingList}
  <form class="add-row" onsubmit={submitList}>
    <input class="grow" type="text" bind:value={newList} placeholder="List name" aria-label="New list name" />
    <button type="submit" class="button">Create</button>
  </form>
{/if}

{#if selected}
  <section>
    <h2>{selected.name}{selected.showOnToday ? '' : ' · not shown on Today'}</h2>
    <form class="add-row" onsubmit={submitTask}>
      <input class="grow" type="text" bind:value={newTask} placeholder="New task" aria-label="New task" />
      <input type="date" bind:value={newTaskDue} aria-label="Deadline (optional)" />
      <button type="submit" class="button">Add</button>
    </form>

    {#if tasks.current.open.length}
      <ul class="list tasks">
        {#each tasks.current.open as task (task.id)}
          <li class="row">
            <label class="check">
              <input type="checkbox" checked={false} onchange={() => setTaskDone(task.id, true, today)} />
              <span class="text">
                <span class="label">{task.title}</span>
                {#if task.due}<span class="detail" class:late={task.due < today}>{dueLabel(task, today)}</span>{/if}
              </span>
            </label>
            {#if task.notes || safeLink(task.link ?? '')}
              <div class="task-notes">
                {#if task.notes}
                  <p class="small pre">
                    {#each linkParts(task.notes) as part, index (index)}
                      {#if part.href}<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>{:else}{part.text}{/if}
                    {/each}
                  </p>
                {/if}
                {#if safeLink(task.link ?? '')}
                  <a class="small" href={safeLink(task.link ?? '')} target="_blank" rel="noopener noreferrer">Open link</a>
                {/if}
              </div>
            {/if}
            {#if task.subtasks.length}
              <ul class="subtasks">
                {#each task.subtasks as subtask (subtask.id)}
                  <li class="row-line" class:done={subtask.done}>
                    <label class="check grow">
                      <input type="checkbox" checked={subtask.done} onchange={() => setTaskDone(subtask.id, !subtask.done, today)} />
                      <span class="label">{subtask.title}</span>
                    </label>
                    <button type="button" class="remove" aria-label="Delete {subtask.title}" onclick={() => confirmDelete(subtask.title) && deleteTask(subtask.id)}
                      >×</button
                    >
                  </li>
                {/each}
              </ul>
            {/if}
            <details class="steps">
              <summary>Edit</summary>
              <div class="edit-panel">
                <label>
                  Name
                  <input
                    type="text"
                    value={task.title}
                    onchange={(event) => {
                      const title = event.currentTarget.value.trim()
                      if (title) void updateTask(task.id, { title })
                    }}
                  />
                </label>
                <label>
                  List
                  <select value={task.listId} aria-label="Move {task.title} to a list" onchange={(event) => moveTaskToList(task.id, event.currentTarget.value)}>
                    {#each lists.current as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
                  </select>
                </label>
                <label>
                  Deadline
                  <input type="date" value={task.due ?? ''} onchange={(event) => updateTask(task.id, { due: event.currentTarget.value || null })} />
                </label>
                <label>
                  Notes
                  <textarea
                    rows="3"
                    value={task.notes ?? ''}
                    placeholder="Anything to remember: steps, sizes, ideas…"
                    onchange={(event) => updateTask(task.id, { notes: event.currentTarget.value.trim() })}
                  ></textarea>
                </label>
                <label>
                  Link
                  <input
                    type="url"
                    value={task.link ?? ''}
                    placeholder="https://…"
                    onchange={(event) => updateTask(task.id, { link: event.currentTarget.value.trim() })}
                  />
                </label>
                <form class="add-row" onsubmit={(event) => submitSubtask(event, task.id)}>
                  <input
                    class="grow"
                    type="text"
                    value={subtaskDrafts[task.id] ?? ''}
                    oninput={(event) => (subtaskDrafts[task.id] = event.currentTarget.value)}
                    placeholder="Add a subtask"
                    aria-label="New subtask for {task.title}"
                  />
                  <button type="submit" class="button small">Add</button>
                </form>
                <button type="button" class="link danger" onclick={() => confirmDelete(task.title) && deleteTask(task.id)}>Delete task</button>
              </div>
            </details>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">Nothing open in {selected.name}.</p>
    {/if}

    {#if tasks.current.archived.length}
      <details class="card archive">
        <summary>Archive ({tasks.current.archived.length})</summary>
        <ul class="plain">
          {#each tasks.current.archived as task (task.id)}
            <li class="row-line">
              <span class="grow">
                <span class="label">{task.title}</span>
                <span class="detail">{task.doneDate ? ` · done ${formatShort(parseDate(task.doneDate))}` : ''}</span>
              </span>
              <button type="button" class="link" onclick={() => setTaskDone(task.id, false, today)}>Restore</button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    <details class="card archive">
      <summary>List settings</summary>
      <div class="edit-panel">
        <label>
          Name
          <input
            type="text"
            value={selected.name}
            onchange={(event) => {
              const name = event.currentTarget.value.trim()
              if (name) void updateList(selected.id, { name })
            }}
          />
        </label>
        <label class="inline-check">
          <input type="checkbox" checked={selected.showOnToday} onchange={(event) => updateList(selected.id, { showOnToday: event.currentTarget.checked })} />
          Show tasks that are due on Today
        </label>
        <button type="button" class="link danger" onclick={() => removeList(selected)}>Delete list</button>
      </div>
    </details>
  </section>
{/if}
