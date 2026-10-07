import type { IconName } from '../components/icons';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HeaderButton, PageHeader, useBack } from '../components/shell';
import { Badge, Card, Checkbox, cx, EmptyState, GhostButton, Icon, ListCard, MemberAvatar, PrimaryButton, ProgressBar, SecondaryButton } from '../components/ui';
import { formatDuration, formatTime, headerDate, relativeDay, shortDate, today } from '../lib/dates';
import { nextOccurrence, recurrenceLabel } from '../lib/recurrence';
import { roomStyle } from '../lib/rooms';
import { useStore } from '../store';
import { deleteTask, postponeTask, toggleTask } from '../store/actions';
import { useMembers } from '../store/selectors';
import { openSheet } from '../store/ui';

function InfoRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3.5 min-h-[52px] py-2">
      <Icon name={icon} className="text-[20px] text-sky-dark" />
      <span className="text-body-md text-ink-sub w-28 shrink-0">{label}</span>
      <span className="text-body-md text-ink flex-1 min-w-0 text-right flex items-center justify-end gap-2">{children}</span>
    </div>
  );
}

export function TaskDetail() {
  const { id } = useParams();
  const back = useBack('/tasks');
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  const allChecklist = useStore((s) => s.checklist);
  const toggleChecklistItem = useStore((s) => s.toggleChecklistItem);
  const members = useMembers();

  if (!task) {
    return (
      <>
        <PageHeader title="Task" back="/tasks" />
        <div className="pt-space-lg" />
        <EmptyState message="This task no longer exists." action={{ label: 'New task', onClick: () => openSheet({ type: 'task' }) }} />
      </>
    );
  }

  const checklist = allChecklist.filter((c) => c.taskId === task.id);
  const done = checklist.filter((c) => c.completed).length;
  const assignee = task.assigneeId ? members.get(task.assigneeId) : undefined;
  const t = today();
  const overdue = !task.completed && task.dueDate < t;
  const rel = relativeDay(task.dueDate, t);
  const dueLabel = rel === shortDate(task.dueDate) ? rel : `${rel} · ${shortDate(task.dueDate)}`;
  const nextDue = task.recurrence && !task.completed ? nextOccurrence(task.dueDate, task.recurrence, t) : null;

  return (
    <>
      <PageHeader title="Task" back="/tasks" right={<HeaderButton icon="edit" label="Edit task" onClick={() => openSheet({ type: 'task', taskId: task.id })} />} />

      <div className="flex flex-col gap-2 pt-space-lg pb-space-lg">
        <div className="flex items-center gap-2 flex-wrap">
          {task.completed ? <Badge tone="done">Completed</Badge> : overdue ? <Badge tone="err">Overdue</Badge> : task.dueDate === t ? <Badge>Due today</Badge> : null}
          {task.area && (
            <span
              className="inline-flex items-center gap-1 text-caption font-medium px-2 py-0.5 rounded-full"
              style={{ background: roomStyle(task.area).bg, color: roomStyle(task.area).fg }}
            >
              <Icon name={roomStyle(task.area).icon} className="text-[15px]" />
              {task.area}
            </span>
          )}
        </div>
        <h1 className={cx('text-headline-lg tracking-tight', task.completed ? 'text-ink-sub line-through' : 'text-ink')}>{task.title}</h1>
      </div>

      <div className="flex flex-col gap-space-lg">
        <ListCard>
          <InfoRow icon="person" label="Assigned to">
            {assignee ? (
              <>
                <MemberAvatar member={assignee} size={24} />
                {assignee.name}
              </>
            ) : (
              'Anyone'
            )}
          </InfoRow>
          <InfoRow icon="event" label="Due">
            <span className={cx(overdue && 'text-err-ink font-medium')}>{dueLabel}</span>
          </InfoRow>
          <InfoRow icon="replay" label="Repeat">
            {recurrenceLabel(task.recurrence, task.dueDate)}
          </InfoRow>
          {task.estimatedDuration != null && (
            <InfoRow icon="timer" label="Duration">
              {formatDuration(task.estimatedDuration)}
            </InfoRow>
          )}
          {task.reminder && (
            <InfoRow icon="alarm" label="Reminder">
              {formatTime(task.reminder)}
            </InfoRow>
          )}
        </ListCard>

        {checklist.length > 0 && (
          <section aria-labelledby="checklist-title">
            <div className="flex items-center justify-between mb-space-sm px-0.5">
              <h2 id="checklist-title" className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                Checklist
              </h2>
              <span className="text-body-sm text-ink-sub">
                {done} of {checklist.length}
              </span>
            </div>
            <Card>
              <div className="px-3.5 pt-3.5">
                <ProgressBar value={done / checklist.length} label="Checklist progress" />
              </div>
              <div className="divide-y divide-line">
                {checklist.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-3.5 min-h-[52px] cursor-pointer active:bg-canvas">
                    <Checkbox checked={c.completed} onChange={() => toggleChecklistItem(c.id)} label={c.title} shape="square" />
                    <span className={cx('text-body-md', c.completed ? 'text-ink-sub line-through' : 'text-ink')}>{c.title}</span>
                  </label>
                ))}
              </div>
            </Card>
          </section>
        )}

        {task.notes && (
          <Card className="p-3.5">
            <h2 className="text-label-md uppercase tracking-wider font-semibold text-ink-sub mb-1">Notes</h2>
            <p className="text-body-md text-ink whitespace-pre-wrap">{task.notes}</p>
          </Card>
        )}

        <div className="flex flex-col gap-2 pt-space-sm">
          {task.completed ? (
            <>
              <SecondaryButton icon="undo" onClick={() => toggleTask(task.id)}>
                Mark as not done
              </SecondaryButton>
              {task.nextOccurrenceId && (
                <Link to={`/tasks/${task.nextOccurrenceId}`} replace className="min-h-[44px] flex items-center justify-center gap-1 text-link text-label-md font-medium">
                  View next occurrence <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              )}
            </>
          ) : (
            <>
              <PrimaryButton icon="check" onClick={() => toggleTask(task.id)}>
                Complete task
              </PrimaryButton>
              {nextDue && <p className="text-center text-body-sm text-ink-sub">The next one will be scheduled for {headerDate(nextDue)}.</p>}
              <GhostButton icon="event" onClick={() => postponeTask(task.id)}>
                Postpone a day
              </GhostButton>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              deleteTask(task.id);
              back();
            }}
            className="min-h-[48px] rounded-xl text-err-ink text-body-md font-medium flex items-center justify-center gap-1.5 active:bg-err/50"
          >
            <Icon name="delete" className="text-[20px]" />
            Delete task
          </button>
        </div>
      </div>
    </>
  );
}
