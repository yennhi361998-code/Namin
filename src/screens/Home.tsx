import { Link, useNavigate } from 'react-router-dom';
import { TaskRow } from '../components/rows';
import { AssigneeFilter, BrandHeader, Fab } from '../components/shell';
import { Checkbox, cx, EmptyState, Icon, NotePaper, SectionHeader } from '../components/ui';
import { relativeDay, shortWeekday } from '../lib/dates';
import { daysLeftLabel } from '../lib/restock';
import { useStore } from '../store';
import { toggleTask } from '../store/actions';
import { useMembers, useRestockMap, useTaskLists } from '../store/selectors';
import { matchesAssignee, openSheet, useUi } from '../store/ui';

const UP_NEXT_LIMIT = 3;
const SHOPPING_PREVIEW = 3;

export function Home() {
  const navigate = useNavigate();
  const members = useMembers();
  const checklist = useStore((s) => s.checklist);
  const shopping = useStore((s) => s.shopping);
  const lists = useTaskLists();
  const restock = useRestockMap();

  const assignee = useUi((s) => s.assignee);
  const filter = assignee && members.has(assignee) ? assignee : null;
  const today = lists.today.filter((t) => matchesAssignee(t.assigneeId, filter));
  const toBuy = shopping.filter((x) => !x.completed);
  const upNext = lists.upcoming.filter((t) => matchesAssignee(t.assigneeId, filter)).slice(0, UP_NEXT_LIMIT);

  return (
    <>
      <BrandHeader />
      <Fab label="Add task" onClick={() => openSheet({ type: 'task' })} />
      <div className="pt-space-lg pb-space-md">
        <AssigneeFilter />
      </div>
      <section className="mb-space-xl" aria-labelledby="home-today">
        <SectionHeader
          id="home-today"
          title="Today"
        />
        {today.length === 0 ? (
          <EmptyState message="No tasks for today." action={{ label: 'Add task', onClick: () => openSheet({ type: 'task' }) }} />
        ) : (
          <NotePaper label="Today's tasks">
            {today.map((t) => {
              const items = checklist.filter((c) => c.taskId === t.id);
              return (
                <TaskRow
                  key={t.id}
                  task={t}
                  member={t.assigneeId ? members.get(t.assigneeId) : undefined}
                  checklist={{ done: items.filter((c) => c.completed).length, total: items.length }}
                  showRecurrence={false}
                  onToggle={() => toggleTask(t.id)}
                  onOpen={() => navigate(`/tasks/${t.id}`)}
                />
              );
            })}
          </NotePaper>
        )}
      </section>

      {upNext.length > 0 && (
        <section className="mb-space-xl" aria-labelledby="home-next">
          <SectionHeader
            id="home-next"
            title="Up next"
            right={
              <Link to="/tasks" className="text-body-sm font-medium text-ink-sub hover:text-link transition-colors">
                See all
              </Link>
            }
          />
          <div className="divide-y divide-black/[0.06] -mx-1">
            {upNext.map((t) => {
              const who = t.assigneeId ? members.get(t.assigneeId)?.name : 'Anyone';
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/tasks/${t.id}`)}
                  className="w-full text-left flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-header-ink/40 group-hover:bg-header-ink group-hover:scale-125 transition-all shrink-0" aria-hidden />
                    <div className="flex flex-col min-w-0">
                      <span className="text-body-md text-ink font-medium truncate">{t.title}</span>
                      <span className="text-caption text-ink-sub">
                        {relativeDay(t.dueDate)} · {who}
                      </span>
                    </div>
                  </div>
                  <span className="text-caption font-medium text-ink-sub/80 shrink-0">
                    {shortWeekday(t.dueDate)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="home-shopping">
        <SectionHeader
          id="home-shopping"
          title="Shopping"
          right={
            <Link to="/shopping" className="text-body-sm font-medium text-ink-sub hover:text-link transition-colors">
              See all
            </Link>
          }
        />
        {toBuy.length === 0 ? (
          <div className="py-2 px-1 flex items-center justify-between text-body-sm text-ink-sub">
            <span>Your shopping list is empty.</span>
            <button
              type="button"
              onClick={() => openSheet({ type: 'shopping' })}
              className="text-link font-medium inline-flex items-center gap-1 hover:underline"
            >
              <Icon name="add" className="text-[16px]" />
              Add item
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06] -mx-1">
            {toBuy.slice(0, SHOPPING_PREVIEW).map((x) => {
              const est = restock.get(x.itemId);
              const qtyStr = x.quantity > 1 ? (x.unit ? `${x.quantity} ${x.unit}` : `×${x.quantity}`) : '';
              return (
                <div
                  key={x.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/items/${x.itemId}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/items/${x.itemId}`);
                    }
                  }}
                  className="w-full text-left flex items-center justify-between py-2 px-2 rounded-lg hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 flex items-center">
                      <Checkbox
                        checked={false}
                        onChange={() => openSheet({ type: 'purchase', shoppingId: x.id })}
                        label={`Mark ${x.name} purchased`}
                        shape="square"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-body-md text-ink font-medium truncate">{x.name}</span>
                      {est != null && (
                        <span
                          className={cx(
                            'text-caption truncate',
                            est.daysLeft <= 0 ? 'text-err-ink font-medium' : est.daysLeft <= 7 ? 'text-amber-800 font-medium' : 'text-ink-sub'
                          )}
                        >
                          {daysLeftLabel(est.daysLeft)}
                        </span>
                      )}
                    </div>
                  </div>
                  {qtyStr && (
                    <span className="text-caption font-medium text-ink-sub/80 px-2 py-0.5 rounded bg-black/[0.04] shrink-0">
                      {qtyStr}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
