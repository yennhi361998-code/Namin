import { addDays, relativeDay, today } from '../lib/dates';
import { useStore } from './index';
import { toast } from './ui';

/** "tomorrow" / "on Saturday" / "on 3 Oct" for use mid-sentence. */
function when(d: string) {
  const r = relativeDay(d);
  return r === 'Today' || r === 'Tomorrow' ? r.toLowerCase() : `on ${r}`;
}

/** One-tap completion. The checkbox itself shows the change and unticking undoes it, so no toast. */
export function toggleTask(id: string) {
  const s = useStore.getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return;
  if (task.completed) s.uncompleteTask(id);
  else s.completeTask(id);
}

export function deleteTask(id: string) {
  const task = useStore.getState().tasks.find((t) => t.id === id);
  const undo = useStore.getState().deleteTask(id);
  toast({ title: 'Task deleted', subtitle: task?.title, action: { label: 'Undo', run: undo } });
}

export function postponeTask(id: string) {
  const s = useStore.getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task) return;
  const prev = task.dueDate;
  // "Tomorrow" means tomorrow from today, even for an overdue task.
  const base = prev < today() ? today() : prev;
  const next = addDays(base, 1);
  s.postponeTask(id, next);
  toast({
    title: `Moved to ${when(next).replace(/^on /, '')}`,
    subtitle: task.title,
    action: { label: 'Undo', run: () => useStore.getState().postponeTask(id, prev) },
  });
}

export function removeFromList(shoppingId: string) {
  const entry = useStore.getState().shopping.find((x) => x.id === shoppingId);
  const undo = useStore.getState().removeShoppingItem(shoppingId);
  toast({ title: 'Removed from list', subtitle: entry?.name, action: { label: 'Undo', run: undo } });
}

/** Tick a scheduled future repeat from the calendar. Only that date is marked done. */
export function completeOccurrence(anchorId: string, date: string) {
  useStore.getState().completeOccurrence(anchorId, date);
}
