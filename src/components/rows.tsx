import { Fragment, type ReactNode } from 'react';
import { formatTime, relativeDay, shortDate, toDateStr, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { recurrenceLabel } from '../lib/recurrence';
import { daysLeftLabel, LOW_THRESHOLD_DAYS, type RestockEstimate } from '../lib/restock';
import type { Member, Purchase, ShoppingItem, Task } from '../lib/types';
import { CategoryDot, Checkbox, cx, Icon, RoomIcon } from './ui';

const Dot = () => <span aria-hidden>·</span>;

function joinMeta(parts: ReactNode[]) {
  return parts.filter(Boolean).map((p, i) => (
    <Fragment key={i}>
      {i > 0 && <Dot />}
      {p}
    </Fragment>
  ));
}

export function TaskRow({
  task,
  member,
  checklist,
  onToggle,
  onOpen,
  showRecurrence = true,
  projected,
  inDay,
}: {
  task: Task;
  member?: Member;
  checklist?: { done: number; total: number };
  onToggle: () => void;
  onOpen: () => void;
  showRecurrence?: boolean;
  /** A future repeat that isn't stored yet (calendar). */
  projected?: boolean;
  /** Listed under a calendar day, so the date itself is redundant: show only the time. */
  inDay?: boolean;
}) {
  const t = today();
  const overdue = !task.completed && task.dueDate < t;
  const dueToday = !task.completed && task.dueDate === t;
  const completedTime = task.completedAt ? new Date(task.completedAt) : null;

  let due: ReactNode;
  if (task.completed && completedTime) {
    const doneDay = toDateStr(completedTime);
    const hhmm = `${completedTime.getHours()}:${completedTime.getMinutes()}`;
    due = <span>Completed {doneDay === t ? formatTime(hhmm) : shortDate(doneDay)}</span>;
  } else if (overdue) {
    // The red dot by the title says it; the due date isn't repeated here.
    due = null;
  } else if (inDay) {
    due = task.reminder ? (
      <span className="flex items-center gap-0.5">
        <Icon name="alarm" className="text-[14px]" />
        {formatTime(task.reminder)}
      </span>
    ) : null;
  } else if (dueToday) {
    due = (
      <span className="text-link font-medium flex items-center gap-0.5">
        <Icon name="alarm" className="text-[14px]" />
        {task.reminder ? `Today ${formatTime(task.reminder)}` : 'Due today'}
      </span>
    );
  } else {
    due = <span>{relativeDay(task.dueDate, t)}</span>;
  }

  return (
    <div
      className={cx('task-row flex items-center gap-3 p-3.5 transition-colors active:bg-soft/50 cursor-pointer no-callout', task.completed && 'opacity-75')}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
      aria-label={`${task.title}${task.completed ? ', completed' : overdue ? ', overdue' : projected ? ', scheduled' : ''}. Open details`}
    >
      <div className="flex">
        <Checkbox
          checked={task.completed}
          onChange={onToggle}
          label={task.completed ? `Mark ${task.title} not done` : `Complete ${task.title}${projected ? ` for ${relativeDay(task.dueDate, t)}` : ''}`}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={cx('text-body-md font-medium truncate transition-colors', task.completed ? 'text-ink-sub line-through' : 'text-ink')}>{task.title}</span>
            {overdue && <span className="w-2 h-2 rounded-full bg-err-ink shrink-0" title="Overdue" aria-hidden />}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {task.area && !task.completed && <RoomIcon room={task.area} />}
            {task.completed && <Icon name="spa" filled className="text-[18px] text-sky-dark" />}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-ink-sub text-body-sm flex-wrap">
          {joinMeta([
            member && <span className={cx(!task.completed && 'text-ink font-medium')}>{member.name}</span>,
            showRecurrence && task.recurrence && !task.completed && (
              <span className="flex items-center gap-0.5">
                {(projected || inDay) && <Icon name="replay" className="text-[14px]" />}
                {recurrenceLabel(task.recurrence, task.dueDate)}
              </span>
            ),
            due,
            checklist && checklist.total > 0 && !task.completed && (
              <span className="flex items-center gap-0.5">
                <Icon name="checklist" className="text-[14px]" />
                {checklist.done}/{checklist.total}
              </span>
            ),
          ])}
        </div>
      </div>
    </div>
  );
}

export function RestockChip({ est }: { est: RestockEstimate }) {
  if (est.daysLeft > LOW_THRESHOLD_DAYS) return null;
  return (
    <span className={cx('inline-flex items-center gap-0.5 px-1.5 rounded-full text-caption font-medium', est.daysLeft <= 0 ? 'bg-err text-err-ink' : 'bg-warn text-warn-ink')}>
      <Icon name="timer" className="text-[12px]" />
      {daysLeftLabel(est.daysLeft)}
    </span>
  );
}

export function quantityLabel(q: number, unit: string) {
  return unit ? `${q} ${unit}` : q > 1 ? `×${q}` : '';
}

export function ShoppingItemRow({
  item,
  est,
  onCheck,
  onOpen,
}: {
  item: ShoppingItem;
  est?: RestockEstimate;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const qty = quantityLabel(item.quantity, item.unit);
  return (
    <div
      className="p-3.5 flex items-start gap-3 active:bg-canvas transition-colors cursor-pointer no-callout"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onOpen())}
      aria-label={`${item.name}. Open item details`}
    >
      <div className="mt-px">
        <Checkbox checked={false} onChange={onCheck} label={`Mark ${item.name} purchased`} shape="square" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-md text-ink truncate">{item.name}</span>
          {item.estimatedPrice != null && <span className="text-label-md text-ink font-semibold shrink-0 tabular-nums">{formatVnd(item.estimatedPrice)}</span>}
        </div>
        {(qty || item.store || est) && (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-body-sm text-ink-sub">
            {joinMeta([
              qty && <span>{qty}</span>,
              item.store && (
                <span className="flex items-center gap-0.5">
                  <Icon name="storefront" className="text-[13px]" />
                  {item.store}
                </span>
              ),
            ])}
            {est && <RestockChip est={est} />}
          </div>
        )}
        {item.note && <div className="mt-1.5 bg-soft text-ink-muted px-2 py-0.5 rounded-md text-body-sm inline-block">{item.note}</div>}
      </div>
    </div>
  );
}

export function PurchaseRow({ purchase, onOpen }: { purchase: Purchase; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full text-left p-3.5 flex items-center gap-3 active:bg-canvas transition-colors">
      <CategoryDot category={purchase.category} size={10} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-body-md text-ink truncate">{purchase.itemName}</span>
          <span className="text-label-md text-ink font-semibold shrink-0 tabular-nums">{purchase.price != null ? formatVnd(purchase.price) : '—'}</span>
        </div>
        <div className="text-body-sm text-ink-sub mt-0.5 flex items-center gap-1.5">
          {joinMeta([<span>{shortDate(purchase.purchaseDate)}</span>, purchase.store && <span>{purchase.store}</span>, <span>{purchase.category}</span>])}
        </div>
      </div>
    </button>
  );
}
