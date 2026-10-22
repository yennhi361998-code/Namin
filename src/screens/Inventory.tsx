import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandHeader, Fab, ScreenTitle } from '../components/shell';
import { SwipeRow, type SwipeAction } from '../components/overlay';
import { Badge, CategoryDot, cx, EmptyState, Icon, SpiralCard } from '../components/ui';
import { guessSpendCategory } from '../lib/moneyCategories';
import { computeItemStatus, estimateRestock, isItemLowStock, STATUS_LABEL } from '../lib/restock';
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
          if (!isItemLowStock(it, est)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort items running low or out first, then alphabetically
        const estA = restock.get(a.id) ?? null;
        const estB = restock.get(b.id) ?? null;
        const stA = computeItemStatus(a, estA);
        const stB = computeItemStatus(b, estB);

        const urgencyScore = (it: typeof a, st: ItemStatus) => {
          if (st === 'out' || (it.currentStock != null && it.currentStock <= 0)) return 0;
          if (st === 'running_low') return 1;
          return 2;
        };

        const scoreA = urgencyScore(a, stA);
        const scoreB = urgencyScore(b, stB);
        if (scoreA !== scoreB) return scoreA - scoreB;

        return a.name.localeCompare(b.name);
      });
  }, [items, selectedRoom, searchQuery, statusFilter, restock, purchases]);

  const totalLowStock = useMemo(() => {
    return items.filter((it) => {
      const est = restock.get(it.id) ?? null;
      return isItemLowStock(it, est);
    }).length;
  }, [items, restock]);

  return (
    <>
      <BrandHeader />

      <ScreenTitle
        title="Inventory"
        subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'}${totalLowStock > 0 ? ` · ${totalLowStock} low on stock` : ''}`}
      />

      <div className="flex flex-col gap-space-md pb-space-xl min-w-0 w-full">
        {/* Room Filter Chips */}
        <section aria-label="Filter by room" className="w-full overflow-hidden">
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
          <SpiralCard>
            <div className="bg-surface rounded-xl border border-line shadow-card divide-y divide-dashed divide-note-line/70 overflow-hidden">
              {filteredItems.map((item, idx) => {
                const est = restock.get(item.id) ?? estimateRestock(item, purchases.filter((p) => p.itemId === item.id));
                const status = computeItemStatus(item, est);
                const roomName = resolveItemRoom(item);
                const usageUnit = item.usageUnit?.trim() || item.unit || 'units';
                const onCart = shoppingMap.has(item.id);
                const linkedTasksCount = linkedTasksCountMap.get(item.id) ?? 0;
                const itemRoom = item.room || (roomName !== 'Other' ? roomName : null);

                const isLow = isItemLowStock(item, est);
                const hasConversion = Boolean(item.unit && item.usageUnit && item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 1);
                const isFirst = idx === 0;
                const isLast = idx === filteredItems.length - 1;

                const swipeActions: SwipeAction[] = [
                  {
                    label: '- Use',
                    icon: 'remove',
                    tone: 'done',
                    onSelect: () => {
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
                    },
                  },
                  {
                    label: 'Task',
                    icon: 'checklist',
                    tone: 'sky',
                    onSelect: () =>
                      openSheet({
                        type: 'task',
                        initialValues: {
                          mappedItemId: item.id,
                          mappedQuantity: 1,
                          area: item.room || (roomName !== 'Other' ? roomName : null),
                          title: `Use ${item.name}`,
                        },
                      }),
                  },
                  {
                    label: 'Expense',
                    icon: 'paid',
                    tone: 'warn',
                    onSelect: () =>
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
                      }),
                  },
                  {
                    label: onCart ? 'In cart' : '+Cart',
                    icon: onCart ? 'check' : 'add_shopping_cart',
                    tone: onCart ? 'soft' : 'indigo',
                    onSelect: () => {
                      if (onCart) {
                        toast({ title: 'Already in shopping list', subtitle: item.name });
                        return;
                      }
                      const res = addToShopping({ name: item.name, itemId: item.id });
                      if (res.ok) toast({ title: 'Added to shopping list', subtitle: item.name });
                    },
                  },
                ];

                return (
                  <SwipeRow
                    key={item.id}
                    className="transition-colors"
                    surface="bg-surface"
                    actionWidth={58}
                    actions={swipeActions}
                  >
                    <div
                      onClick={() => navigate(`/items/${item.id}`)}
                      className={cx(
                        'px-3.5 flex items-start justify-between gap-3 cursor-pointer active:bg-soft/40 transition-colors group',
                        isFirst && isLast ? 'py-3.5' : isFirst ? 'pt-3.5 pb-2.5' : isLast ? 'pt-2.5 pb-3.5' : 'py-2.5'
                      )}
                    >
                      {/* Left: Room Icon, Item Name, Linked Task Icon, and Category Badge */}
                      <div className="flex flex-col min-w-0">
                        <h3 className="text-[15px] font-semibold text-ink group-hover:text-link transition-colors truncate flex items-center gap-1.5 leading-[20px]">
                          {itemRoom && (
                            <span
                              className="w-5 h-5 rounded-md inline-flex items-center justify-center shrink-0"
                              style={{ background: roomStyle(itemRoom).bg, color: roomStyle(itemRoom).fg }}
                              title={itemRoom}
                            >
                              <Icon name={roomStyle(itemRoom).icon} className="text-[12px]" />
                            </span>
                          )}
                          <span className="truncate">{item.name}</span>
                          {linkedTasksCount > 0 && (
                            <span
                              className="inline-flex items-center text-sky-dark shrink-0"
                              title={`${linkedTasksCount} task${linkedTasksCount === 1 ? '' : 's'} linked`}
                            >
                              <Icon name="checklist" className="text-[14px]" />
                            </span>
                          )}
                        </h3>
                        {/* Category Badge (only if non-Other and different from room) */}
                        {item.category && item.category !== 'Other' && item.category !== itemRoom && (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-caption text-ink-sub bg-soft px-2 py-0.5 rounded-full border border-line/40">
                              <CategoryDot category={item.category} size={8} />
                              <span>{item.category}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: Stock, Packaging Conversion, Status Badge */}
                      <div className="flex flex-col items-end shrink-0 text-right">
                        <span className={cx('text-[12px] font-bold tabular-nums', isLow ? 'text-err-ink font-bold' : 'text-ink')}>
                          {item.currentStock != null ? `${item.currentStock} ${usageUnit}` : 'Stock not set'}
                        </span>
                        {hasConversion && (
                          <span className="text-[11px] text-ink-sub leading-tight mt-0.5">
                            1 {item.unit} = {item.usagePerPurchaseUnit} {item.usageUnit}
                          </span>
                        )}
                        {status !== 'unknown' && STATUS_LABEL[status] && (
                          <div className="mt-1">
                            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          </SpiralCard>
        )}
      </div>

      <Fab label="Add item" onClick={() => openSheet({ type: 'item' })} />
    </>
  );
}
