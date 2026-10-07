import { Link, useNavigate } from 'react-router-dom';
import { TaskRow } from '../components/rows';
import { AssigneeFilter, BrandHeader, Fab } from '../components/shell';
import { Card, EmptyState, Icon, ListCard, NotePaper, SectionHeader } from '../components/ui';
import { relativeDay, shortWeekday } from '../lib/dates';
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

  // The most urgent list item with a real estimate drives the quiet hint.
  const soonest = toBuy
    .map((x) => ({ x, est: restock.get(x.itemId) }))
    .filter((r) => r.est && r.est.daysLeft <= 14)
    .sort((a, b) => a.est!.daysLeft - b.est!.daysLeft)[0];
  const lowCount = toBuy.filter((x) => (restock.get(x.itemId)?.daysLeft ?? Infinity) <= 7).length;


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
              <Link to="/tasks" className="min-h-[44px] -my-2 flex items-center text-body-sm text-ink-sub">
                See all
              </Link>
            }
          />
          <ListCard>
            {upNext.map((t) => {
              const who = t.assigneeId ? members.get(t.assigneeId)?.name : 'Anyone';
              return (
                <button key={t.id} type="button" onClick={() => navigate(`/tasks/${t.id}`)} className="w-full text-left flex items-center justify-between p-space-md active:bg-canvas transition-colors">
                  <div className="flex items-center gap-space-md min-w-0">
                    <span className="w-6 h-6 rounded-full bg-soft flex items-center justify-center shrink-0" aria-hidden>
                      <span className="w-2 h-2 rounded-full bg-sky" />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-body-md text-ink truncate">{t.title}</span>
                      <span className="text-body-sm text-ink-sub">
                        {relativeDay(t.dueDate)} · {who}
                      </span>
                    </div>
                  </div>
                  <span className="text-caption text-ink-sub px-2 py-0.5 rounded bg-soft shrink-0">{shortWeekday(t.dueDate)}</span>
                </button>
              );
            })}
          </ListCard>
        </section>
      )}

      <section aria-labelledby="home-shopping">
        <SectionHeader
          id="home-shopping"
          title="Shopping"
          right={lowCount > 0 ? <span className="text-body-sm text-ink-sub">{lowCount} running low</span> : undefined}
        />
        {toBuy.length === 0 ? (
          <EmptyState message="Your shopping list is empty." action={{ label: 'Add item', onClick: () => openSheet({ type: 'shopping' }) }} />
        ) : (
          <Card className="p-space-md flex flex-col gap-space-md">
            <div className="flex items-center gap-space-sm flex-wrap">
              {toBuy.slice(0, SHOPPING_PREVIEW).map((x) => (
                <span key={x.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-soft text-ink">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-dark" aria-hidden />
                  <span className="text-label-md">{x.name}</span>
                </span>
              ))}
              {toBuy.length > SHOPPING_PREVIEW && <span className="text-label-md text-ink-sub px-1">+{toBuy.length - SHOPPING_PREVIEW} more</span>}
            </div>
            {soonest?.est && (
              <div className="flex items-center gap-space-sm p-space-sm bg-soft rounded-lg">
                <Icon name="hourglass_top" className="text-[18px] text-sky-dark shrink-0" />
                <span className="text-body-sm text-ink flex-1">
                  {soonest.est.daysLeft > 0
                    ? `~${soonest.est.daysLeft} day${soonest.est.daysLeft > 1 ? 's' : ''} until ${soonest.x.name.toLowerCase()} runs out, based on past purchases.`
                    : `${soonest.x.name} is probably running out, based on past purchases.`}
                </span>
              </div>
            )}
            <Link to="/shopping" className="flex items-center justify-between min-h-[44px] -mb-1 text-link text-label-md font-medium">
              <span>View shopping</span>
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
          </Card>
        )}
      </section>
    </>
  );
}
