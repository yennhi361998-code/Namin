import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandHeader, Fab, ScreenTitle } from '../components/shell';
import { Badge, Card, CategoryDot, EmptyState, Icon } from '../components/ui';
import { guessSpendCategory } from '../lib/moneyCategories';
import { estimateRestock, STATUS_LABEL, statusFromEstimate } from '../lib/restock';
import { ROOMS, roomStyle, resolveItemRoom } from '../lib/rooms';
import type { ItemStatus } from '../lib/types';
import { useStore } from '../store';
import { useRestockMap } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

const STATUS_TONE = { in_stock: 'done', running_low: 'warn', out: 'err', unknown: 'plain' } as const;

export function Inventory() {
  const navigate = useNavigate();
  const items = useStore((s) => s.items);
  const tasks = useStore((s) => s.tasks);
  const purchases = useStore((s) => s.purchases);
  const shopping = useStore((s) => s.shopping);
  const addToShopping = useStore((s) => s.addToShopping);
  const useItem = useStore((s) => s.useItem);
  const restock = useRestockMap();

  const [selectedRoom, setSelectedRoom] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Map of active shopping items by itemId
  const shoppingMap = useMemo(() => {
    const map = new Map<string, string>();
    shopping.forEach((sh) => {
      if (!sh.completed && sh.itemId) map.set(sh.itemId, sh.id);
    });
    return map;
  }, [shopping]);

  // Map of linked active tasks by mappedItemId
  const linkedTasksCountMap = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.mappedItemId && !t.completed) {
        map.set(t.mappedItemId, (map.get(t.mappedItemId) ?? 0) + 1);
      }
    });
    return map;
  }, [tasks]);

  // Room item counts
  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    ROOMS.forEach((r) => {
      counts[r.name] = 0;
    });
    counts['Other'] = 0;

    items.forEach((it) => {
      const r = resolveItemRoom(it);
      counts[r] = (counts[r] ?? 0) + 1;
    });
    return counts;
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items
      .filter((it) => {
        // Room filter
        if (selectedRoom !== 'All') {
          const room = resolveItemRoom(it);
          if (room !== selectedRoom) return false;
        }

        // Search filter
        if (query && !it.name.toLowerCase().includes(query)) {
          return false;
        }

        // Status filter
        if (statusFilter === 'low') {
          const est = restock.get(it.id) ?? estimateRestock(it, purchases.filter((p) => p.itemId === it.id));
          const st = statusFromEstimate(est);
          const isLow = st === 'running_low' || st === 'out' || (it.currentStock != null && it.currentStock <= 1);
          if (!isLow) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort items running low or out first, then alphabetically
        const estA = restock.get(a.id) ?? null;
        const estB = restock.get(b.id) ?? null;
        const stA = statusFromEstimate(estA);
        const stB = statusFromEstimate(estB);

        const urgencyScore = (st: ItemStatus, stock: number | null) => {
          if (st === 'out' || stock === 0) return 0;
          if (st === 'running_low' || (stock != null && stock <= 1)) return 1;
          return 2;
        };

        const scoreA = urgencyScore(stA, a.currentStock);
        const scoreB = urgencyScore(stB, b.currentStock);
        if (scoreA !== scoreB) return scoreA - scoreB;

        return a.name.localeCompare(b.name);
      });
  }, [items, selectedRoom, searchQuery, statusFilter, restock, purchases]);

  const totalLowStock = useMemo(() => {
    return items.filter((it) => {
      const est = restock.get(it.id) ?? null;
      const st = statusFromEstimate(est);
      return st === 'running_low' || st === 'out' || (it.currentStock != null && it.currentStock <= 1);
    }).length;
  }, [items, restock]);

  return (
    <>
      <BrandHeader />

      <ScreenTitle
        title="Inventory"
        subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'}${totalLowStock > 0 ? ` · ${totalLowStock} low on stock` : ''}`}
      />

      <div className="flex flex-col gap-space-md pb-space-xl">
        {/* Room Filter Chips */}
        <section aria-label="Filter by room">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-margin px-margin py-1">
            {/* All Chip */}
            <button
              type="button"
              onClick={() => setSelectedRoom('All')}
              title="All rooms"
              aria-label="All rooms"
              className={`rounded-full inline-flex items-center shrink-0 border transition-all duration-200 cursor-pointer ${
                selectedRoom === 'All'
                  ? 'min-h-[36px] px-3.5 gap-1.5 bg-header border-header-ink/30 text-header-ink font-semibold shadow-xs text-label-md'
                  : 'w-[36px] h-[36px] p-0 justify-center bg-surface border-line text-ink-sub hover:bg-soft/60 active:scale-95'
              }`}
            >
              <Icon name="home" className="text-[17px]" />
              {selectedRoom === 'All' && (
                <>
                  <span>All</span>
                  <span className="text-caption px-1.5 py-0.2 rounded-full bg-white/40">
                    {roomCounts['All']}
                  </span>
                </>
              )}
            </button>

            {/* Room Chips */}
            {ROOMS.map((r) => {
              const active = selectedRoom === r.name;
              const count = roomCounts[r.name] ?? 0;
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => setSelectedRoom(r.name)}
                  title={r.name}
                  aria-label={`Filter by ${r.name}`}
                  className={`rounded-full inline-flex items-center shrink-0 border transition-all duration-200 cursor-pointer ${
                    active
                      ? 'min-h-[36px] px-3.5 gap-1.5 bg-header border-header-ink/30 text-header-ink font-semibold shadow-xs text-label-md'
                      : 'w-[36px] h-[36px] p-0 justify-center bg-surface border-line hover:bg-soft/60 active:scale-95'
                  }`}
                >
                  <Icon name={r.icon} className="text-[17px]" style={{ color: active ? 'inherit' : r.fg }} />
                  {active && (
                    <>
                      <span>{r.name}</span>
                      {count > 0 && (
                        <span className="text-caption px-1.5 py-0.2 rounded-full bg-white/40">
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}

            {/* Other / Unassigned */}
            {(roomCounts['Other'] ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setSelectedRoom('Other')}
                title="Other"
                aria-label="Filter by Other"
                className={`rounded-full inline-flex items-center shrink-0 border transition-all duration-200 cursor-pointer ${
                  selectedRoom === 'Other'
                    ? 'min-h-[36px] px-3.5 gap-1.5 bg-header border-header-ink/30 text-header-ink font-semibold shadow-xs text-label-md'
                    : 'w-[36px] h-[36px] p-0 justify-center bg-surface border-line text-ink-sub hover:bg-soft/60 active:scale-95'
                }`}
              >
                <Icon name="category" className="text-[17px]" />
                {selectedRoom === 'Other' && (
                  <>
                    <span>Other</span>
                    <span className="text-caption px-1.5 py-0.2 rounded-full bg-white/40">
                      {roomCounts['Other']}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {/* Status Filter & Search Header */}
        {isSearchOpen ? (
          <div className="flex flex-col gap-1.5">
            <div className="relative flex items-center w-full">
              <Icon name="search" className="absolute left-3.5 text-[18px] text-ink-sub pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Search items by name..."
                autoFocus
                className="w-full h-10 pl-10 pr-9 bg-surface rounded-xl border border-line text-body-md text-ink placeholder:text-ink-sub/60 focus:outline-none focus:ring-2 focus:ring-sky/40 transition-all"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-ink-sub hover:text-ink hover:bg-soft transition-colors cursor-pointer"
                aria-label="Close search"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            </div>
            <div className="flex items-center justify-between px-1 text-caption text-ink-sub">
              <span>
                {searchQuery.trim()
                  ? `${filteredItems.length} ${filteredItems.length === 1 ? 'item' : 'items'} found`
                  : 'Type to filter items by name'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-0.5 rounded-full text-caption font-medium border transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-ink text-canvas border-ink font-semibold'
                      : 'bg-surface text-ink-sub border-line hover:bg-soft'
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('low')}
                  className={`px-2 py-0.5 rounded-full text-caption font-medium border transition-colors cursor-pointer ${
                    statusFilter === 'low'
                      ? 'bg-ink text-canvas border-ink font-semibold'
                      : 'bg-surface text-ink-sub border-line hover:bg-soft'
                  }`}
                >
                  Low/Out ({totalLowStock})
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-caption font-medium border transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-ink text-canvas border-ink font-semibold'
                    : 'bg-surface text-ink-sub border-line hover:bg-soft'
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('low')}
                className={`px-3 py-1 rounded-lg text-caption font-medium border transition-colors cursor-pointer ${
                  statusFilter === 'low'
                    ? 'bg-ink text-canvas border-ink font-semibold'
                    : 'bg-surface text-ink-sub border-line hover:bg-soft'
                }`}
              >
                Low/Out ({totalLowStock})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search items"
              title="Search items"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-sub hover:text-ink hover:bg-surface active:bg-soft transition-colors cursor-pointer"
            >
              <Icon name="search" className="text-[18px]" />
            </button>
          </div>
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <EmptyState
            message="No items in inventory yet. Add household items to track stock, link tasks, and manage expenses."
            action={{ label: 'Add first item', onClick: () => openSheet({ type: 'item' }) }}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            message="No items match your filter criteria."
            action={{
              label: 'Reset filter',
              onClick: () => {
                setSelectedRoom('All');
                setStatusFilter('all');
                setSearchQuery('');
                setIsSearchOpen(false);
              },
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => {
              const est = restock.get(item.id) ?? estimateRestock(item, purchases.filter((p) => p.itemId === item.id));
              const status = statusFromEstimate(est);
              const roomName = resolveItemRoom(item);
              const usageUnit = item.usageUnit?.trim() || item.unit || 'units';
              const onCart = shoppingMap.has(item.id);
              const linkedTasksCount = linkedTasksCountMap.get(item.id) ?? 0;

              return (
                <Card
                  key={item.id}
                  onClick={() => navigate(`/items/${item.id}`)}
                  className="p-3.5 flex flex-col gap-2.5 transition-all hover:border-line-strong active:scale-[0.99] cursor-pointer group"
                >
                  {/* Top Row: Name and Stock */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <h3 className="text-title-sm text-ink font-semibold group-hover:text-link transition-colors truncate">
                        {item.name}
                      </h3>
                      {/* Room & Category Badges */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {item.room && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium"
                            style={{ background: roomStyle(item.room).bg, color: roomStyle(item.room).fg }}
                          >
                            <Icon name={roomStyle(item.room).icon} className="text-[12px]" />
                            <span>{item.room}</span>
                          </span>
                        )}
                        {(!item.room || item.category !== item.room) && (
                          <span className="inline-flex items-center gap-1 text-caption text-ink-sub bg-soft px-2 py-0.5 rounded-full border border-line/40">
                            <CategoryDot category={item.category} size={8} />
                            <span>{item.category}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock & Status Badge */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-label-md font-bold text-ink tabular-nums">
                        {item.currentStock != null ? `${item.currentStock} ${usageUnit}` : 'Stock not set'}
                      </span>
                      {status !== 'unknown' && STATUS_LABEL[status] && (
                        <div className="mt-1">
                          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle Row: Stats & Details */}
                  <div className="flex items-center justify-between text-caption text-ink-sub pt-2 border-t border-line/40 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      {linkedTasksCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-sky-dark">
                          <Icon name="checklist" className="text-[14px]" />
                          {linkedTasksCount} {linkedTasksCount === 1 ? 'task' : 'tasks'} linked
                        </span>
                      ) : (
                        <span className="text-ink-sub/70">No tasks linked</span>
                      )}
                      {item.unit && item.usageUnit && item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 1 && (
                        <span>
                          1 {item.unit} = {item.usagePerPurchaseUnit} {item.usageUnit}
                        </span>
                      )}
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Use Item (-1) Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const current = item.currentStock != null ? item.currentStock : (item.quantity ?? 1) * (item.usagePerPurchaseUnit ?? 1);
                          if (current <= 0) {
                            toast({ title: 'Already out of stock', subtitle: `${item.name} has 0 left` });
                            return;
                          }
                          const undo = useItem(item.id, 1);
                          const nextStock = Math.max(0, current - 1);
                          toast({
                            title: `Used 1 ${usageUnit}`,
                            subtitle: `${item.name} · ${nextStock} left`,
                            action: { label: 'Undo', run: undo },
                          });
                        }}
                        title={`Use 1 ${usageUnit}`}
                        className="px-2 py-1 rounded-lg bg-soft hover:bg-soft/80 active:scale-95 text-caption font-semibold text-ink flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Icon name="remove" className="text-[13px]" />
                        <span>Use</span>
                      </button>

                      {/* Link / Add Task Button */}
                      <button
                        type="button"
                        onClick={() =>
                          openSheet({
                            type: 'task',
                            initialValues: {
                              mappedItemId: item.id,
                              mappedQuantity: 1,
                              area: item.room || (roomName !== 'Other' ? roomName : null),
                              title: `Use ${item.name}`,
                            },
                          })
                        }
                        title="Create linked task"
                        className="px-2 py-1 rounded-lg bg-soft hover:bg-soft/80 active:bg-sky/20 text-caption font-semibold text-sky-dark flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Icon name="checklist" className="text-[13px]" />
                        <span>+ Task</span>
                      </button>

                      {/* Log Purchase / Expense Button */}
                      <button
                        type="button"
                        onClick={() =>
                          openSheet({
                            type: 'transaction',
                            txType: 'expense',
                            scope: 'household',
                            initialValues: {
                              note: item.name,
                              quantity: 1,
                              unit: item.unit,
                              itemId: item.id,
                              categoryId: item.spendCategoryId || guessSpendCategory(item.name),
                            },
                          })
                        }
                        title="Record purchase expense"
                        className="px-2 py-1 rounded-lg bg-soft hover:bg-soft/80 active:bg-header-ink/10 text-caption font-semibold text-ink flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Icon name="paid" className="text-[13px]" />
                        <span>+ Expense</span>
                      </button>

                      {/* Shopping Cart Button */}
                      {!onCart && (
                        <button
                          type="button"
                          onClick={() => {
                            const res = addToShopping({ name: item.name, itemId: item.id });
                            if (res.ok) toast({ title: 'Added to shopping list', subtitle: item.name });
                          }}
                          title="Add to shopping list"
                          className="px-2 py-1 rounded-lg bg-soft hover:bg-soft/80 text-caption font-medium text-ink-sub flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Icon name="add_shopping_cart" className="text-[13px]" />
                          <span>+ Cart</span>
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Fab label="Add item" onClick={() => openSheet({ type: 'item' })} />
    </>
  );
}
