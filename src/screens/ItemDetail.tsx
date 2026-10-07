import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { SwipeRow } from '../components/overlay';
import { quantityLabel } from '../components/rows';
import { HeaderButton, PageHeader } from '../components/shell';
import { Badge, Card, CategoryDot, EmptyState, GhostButton, Icon, ListCard, PrimaryButton, SecondaryButton } from '../components/ui';
import { longDate, shortDate } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { STATUS_LABEL, statusFromEstimate } from '../lib/restock';
import { useStore } from '../store';
import { useRestockMap } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 min-h-[48px] py-2">
      <span className="text-body-md text-ink-sub">{label}</span>
      <span className="text-body-md text-ink text-right">{children}</span>
    </div>
  );
}

const STATUS_TONE = { in_stock: 'done', running_low: 'warn', out: 'err', unknown: 'plain' } as const;

export function ItemDetail() {
  const { id } = useParams();
  const item = useStore((s) => s.items.find((i) => i.id === id));
  const allPurchases = useStore((s) => s.purchases);
  const onList = useStore((s) => s.shopping.find((x) => x.itemId === id && !x.completed));
  const addToShopping = useStore((s) => s.addToShopping);
  const deletePurchase = useStore((s) => s.deletePurchase);
  const restock = useRestockMap();

  if (!item) {
    return (
      <>
        <PageHeader title="Item" back="/shopping" />
        <div className="pt-space-lg" />
        <EmptyState message="This item no longer exists." action={{ label: 'Add item', onClick: () => openSheet({ type: 'shopping' }) }} />
      </>
    );
  }

  const purchases = allPurchases.filter((p) => p.itemId === item.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const est = restock.get(item.id) ?? null;
  const status = statusFromEstimate(est);
  const last = purchases[0];
  const priced = purchases.filter((p) => p.price != null);
  const avgPrice = priced.length > 1 ? priced.reduce((n, p) => n + p.price!, 0) / priced.length : null;
  const stores = new Map<string, number>();
  purchases.forEach((p) => p.store && stores.set(p.store, (stores.get(p.store) ?? 0) + 1));
  const usualStore = [...stores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const name = item.name.toLowerCase();

  let summary: string;
  if (!est) {
    summary = purchases.length
      ? `Record one more purchase of ${name} and Namin can estimate when you'll need it again.`
      : `No purchases of ${name} yet.`;
  } else {
    const lasts =
      est.basis === 'history'
        ? `Based on previous purchases, ${name} usually lasts about ${est.cycleDays} days.`
        : `You set ${name} to last about ${est.cycleDays} days.`;
    const next =
      est.daysLeft > 0
        ? `Estimated next purchase in ${est.daysLeft} day${est.daysLeft === 1 ? '' : 's'}.`
        : est.daysLeft === 0
          ? 'You may need it today.'
          : `It was due ${-est.daysLeft} day${est.daysLeft === -1 ? '' : 's'} ago.`;
    summary = `${lasts} ${next}`;
  }

  return (
    <>
      <PageHeader title="Item" back="/shopping" right={<HeaderButton icon="edit" label="Edit item" onClick={() => openSheet({ type: 'item', itemId: item.id })} />} />

      <div className="flex flex-col gap-2 pt-space-lg pb-space-lg">
        <div className="flex items-center gap-2 text-body-sm text-ink-sub">
          <CategoryDot category={item.category} size={10} />
          {item.category}
        </div>
        <h1 className="text-headline-lg text-ink tracking-tight">{item.name}</h1>
      </div>

      <div className="flex flex-col gap-space-lg">
        <Card className="p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-label-md text-ink-sub font-medium">Current status</span>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          <p className="text-body-md text-ink">{summary}</p>
        </Card>

        {(last || est) && (
          <ListCard>
            {last && <Row label="Last purchased">{longDate(last.purchaseDate)}</Row>}
            {last?.price != null && <Row label="Last price">{formatVnd(last.price)}</Row>}
            {avgPrice != null && <Row label="Average price">{formatVnd(avgPrice)}</Row>}
            {est && <Row label="Typical usage">~{est.cycleDays} days</Row>}
            {est && <Row label="Next purchase">Around {shortDate(est.nextPurchase)}</Row>}
            {usualStore && <Row label="Usually from">{usualStore}</Row>}
          </ListCard>
        )}

        {onList && (
          <button
            type="button"
            onClick={() => openSheet({ type: 'shopping', shoppingId: onList.id })}
            className="w-full text-left p-3.5 rounded-xl bg-soft border border-sky/30 flex items-center gap-3 active:bg-soft/70"
          >
            <Icon name="shopping_bag" className="text-[20px] text-sky-dark" />
            <div className="flex-1 min-w-0">
              <p className="text-label-md text-ink font-semibold">On your shopping list</p>
              <p className="text-body-sm text-ink-sub truncate">
                {[quantityLabel(onList.quantity, onList.unit), onList.store, onList.estimatedPrice != null ? formatVnd(onList.estimatedPrice) : null].filter(Boolean).join(' · ') || 'Tap to edit'}
              </p>
            </div>
            <Icon name="chevron_right" className="text-[20px] text-ink-sub" />
          </button>
        )}

        <div className="flex flex-col gap-2">
          {!onList && (
            <PrimaryButton
              icon="add_shopping_cart"
              onClick={() => {
                const res = addToShopping({ name: item.name, itemId: item.id });
                if (res.ok) toast({ title: 'Added to shopping list', subtitle: item.name });
              }}
            >
              Add to shopping list
            </PrimaryButton>
          )}
          <SecondaryButton icon="shopping_cart_checkout" onClick={() => openSheet(onList ? { type: 'purchase', shoppingId: onList.id } : { type: 'purchase', itemId: item.id })}>
            Record purchase
          </SecondaryButton>
          <GhostButton icon="edit" onClick={() => openSheet({ type: 'item', itemId: item.id })}>
            Edit item
          </GhostButton>
        </div>

        <section aria-labelledby="ph-title">
          <div className="flex items-center justify-between mb-space-sm px-0.5">
            <h2 id="ph-title" className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
              Purchase history
            </h2>
            {purchases.length > 0 && <span className="text-body-sm text-ink-sub">{purchases.length}</span>}
          </div>
          {purchases.length === 0 ? (
            <EmptyState message="No purchases yet." action={{ label: 'Record purchase', onClick: () => openSheet({ type: 'purchase', itemId: item.id }) }} />
          ) : (
            <ListCard>
              {purchases.map((p) => (
                <SwipeRow
                  key={p.id}
                  actions={[
                    {
                      label: 'Delete',
                      icon: 'delete',
                      tone: 'err',
                      onSelect: () => {
                        const undo = deletePurchase(p.id);
                        toast({ title: 'Purchase deleted', subtitle: `${shortDate(p.purchaseDate)}${p.price != null ? ` · ${formatVnd(p.price)}` : ''}`, action: { label: 'Undo', run: undo } });
                      },
                    },
                  ]}
                >
                  <div className="flex items-center justify-between gap-3 px-3.5 min-h-[52px] py-2">
                    <div className="flex flex-col">
                      <span className="text-body-md text-ink">{longDate(p.purchaseDate)}</span>
                      <span className="text-body-sm text-ink-sub">{[quantityLabel(p.quantity, p.unit), p.store].filter(Boolean).join(' · ')}</span>
                    </div>
                    <span className="text-label-md text-ink font-semibold tabular-nums">{p.price != null ? formatVnd(p.price) : '—'}</span>
                  </div>
                </SwipeRow>
              ))}
            </ListCard>
          )}
          {purchases.length > 0 && <p className="text-caption text-ink-sub text-center mt-2">Swipe a purchase left to delete it.</p>}
        </section>
      </div>
    </>
  );
}
