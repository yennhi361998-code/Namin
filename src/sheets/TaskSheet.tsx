import { useRef, useState } from 'react';
import { DatePicker, FormField, Select, Stepper, TextArea, TextInput } from '../components/forms';
import { DatePickerModal } from '../components/DatePickerModal';
import { BottomSheet } from '../components/overlay';
import { ChipGroup, cx, Icon, PrimaryButton } from '../components/ui';
import { shortDate, today } from '../lib/dates';
import { uid } from '../lib/id';
import { ROOMS } from '../lib/rooms';
import { RECURRENCE_PRESETS, recurrenceLabel, sameCadence } from '../lib/recurrence';
import type { DateStr, Recurrence } from '../lib/types';
import { useStore, type TaskInput } from '../store';
import { toast } from '../store/ui';

export function TaskSheet({
  open,
  onClose,
  taskId,
  dueDate,
  initialValues,
}: {
  open: boolean;
  onClose: () => void;
  taskId?: string;
  dueDate?: DateStr;
  initialValues?: {
    title?: string;
    mappedItemId?: string | null;
    mappedQuantity?: number | null;
    area?: string | null;
  };
}) {
  const existing = useStore((s) => (taskId ? s.tasks.find((t) => t.id === taskId) : undefined));
  const existingChecklist = useStore((s) => s.checklist);
  const items = useStore((s) => s.items);
  const members = useStore((s) => s.members);
  const currentMemberId = useStore((s) => s.currentMemberId);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);

  const [title, setTitle] = useState(existing?.title ?? initialValues?.title ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(existing ? existing.assigneeId : currentMemberId);
  const [due, setDue] = useState<DateStr>(existing?.dueDate ?? dueDate ?? today());
  const [recurrence, setRecurrence] = useState<Recurrence | null>(existing?.recurrence ?? null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<DateStr | null>(existing?.recurrence?.endDate ?? null);
  const [endDatePickerOpen, setEndDatePickerOpen] = useState(false);
  const [mappedItemId, setMappedItemId] = useState<string | null>(existing?.mappedItemId ?? initialValues?.mappedItemId ?? null);
  const [mappedQuantity, setMappedQuantity] = useState<number>(existing?.mappedQuantity ?? initialValues?.mappedQuantity ?? 1);
  const [area, setArea] = useState<string | null>(existing?.area ?? initialValues?.area ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const [checklist, setChecklist] = useState(() =>
    existing ? existingChecklist.filter((c) => c.taskId === existing.id).map((c) => ({ id: c.id, title: c.title, completed: c.completed })) : [],
  );
  const [step, setStep] = useState('');
  const [showMore, setShowMore] = useState(
    !!existing && !!(existing.notes || checklist.length),
  );
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  // Keep a custom recurrence (e.g. every 3 months) selectable when editing.
  const presets =
    recurrence && !RECURRENCE_PRESETS.some((p) => sameCadence(p.value, recurrence))
      ? [...RECURRENCE_PRESETS, { label: recurrenceLabel({ unit: recurrence.unit, interval: recurrence.interval }), value: recurrence }]
      : RECURRENCE_PRESETS;

  const addStep = () => {
    if (!step.trim()) return;
    setChecklist((c) => [...c, { id: uid(), title: step.trim(), completed: false }]);
    setStep('');
  };

  const effectiveRecurrence: Recurrence | null = recurrence
    ? {
        unit: recurrence.unit,
        interval: recurrence.interval,
        endDate: recurrenceEndDate || null,
      }
    : null;

  const submit = () => {
    if (submitted.current) return;
    if (!title.trim()) {
      setError('Give the task a name.');
      return;
    }
    if (recurrence && recurrenceEndDate && recurrenceEndDate < due) {
      setError('Repeat end date must be on or after the due date.');
      return;
    }
    submitted.current = true;
    const all = step.trim() ? [...checklist, { id: uid(), title: step.trim(), completed: false }] : checklist;
    const input: TaskInput = {
      title,
      assigneeId,
      dueDate: due,
      recurrence: effectiveRecurrence,
      reminder: existing?.reminder ?? null,
      estimatedDuration: existing?.estimatedDuration ?? null,
      area,
      notes,
      checklist: all,
      mappedItemId: mappedItemId || null,
      mappedQuantity: mappedItemId ? Math.max(1, mappedQuantity || 1) : null,
    };
    if (existing) {
      updateTask(existing.id, input);
      toast({ title: 'Changes saved' });
    } else {
      addTask(input);
      toast({ title: 'Task added', subtitle: title.trim() });
    }
    onClose();
  };

  const selectedItem = mappedItemId ? items.find((i) => i.id === mappedItemId) : undefined;
  const usageUnit = selectedItem ? (selectedItem.usageUnit?.trim() || selectedItem.unit || 'unit') : '';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit task' : 'New task'}
      footer={
        <PrimaryButton onClick={submit} icon={existing ? undefined : 'add'}>
          {existing ? 'Save changes' : 'Add task'}
        </PrimaryButton>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label="Task name" error={error} htmlFor="task-title">
          <TextInput
            id="task-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Task title"
            invalid={!!error}
            enterKeyHint="done"
            autoComplete="off"
            maxLength={120}
          />
        </FormField>

        <FormField label="Assigned to">
          <ChipGroup
            label="Assigned to"
            value={assigneeId}
            onChange={setAssigneeId}
            options={[
              { label: 'All', value: null },
              ...members.map((m) => ({ label: m.id === currentMemberId ? `${m.name} (you)` : m.name, value: m.id as string | null, dot: m.color })),
            ]}
          />
        </FormField>

        <FormField label="Due date">
          <DatePicker label="Due date" value={due} onChange={setDue} />
        </FormField>

        <FormField label="Repeat" hint={effectiveRecurrence ? `${recurrenceLabel(effectiveRecurrence, due)}. The next one is scheduled when you complete this.` : undefined}>
          <ChipGroup
            label="Repeat"
            value={recurrence}
            onChange={(val) => {
              if (!val) {
                setRecurrence(null);
              } else {
                setRecurrence({ ...val, endDate: recurrenceEndDate });
              }
            }}
            isEqual={sameCadence}
            options={presets}
          />

          {recurrence && (
            <div className="mt-2.5 pt-2.5 border-t border-line/40 flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-body-sm font-medium text-ink">Repeat until</span>
                <span className="text-caption text-ink-sub truncate">
                  {recurrenceEndDate ? `Stops after ${shortDate(recurrenceEndDate)}` : 'No end date (repeats indefinitely)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEndDatePickerOpen(true)}
                  className={cx(
                    'min-h-[34px] px-3 py-1 rounded-full text-body-sm border inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                    recurrenceEndDate ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub hover:text-ink'
                  )}
                >
                  <Icon name="event" className="text-[16px] text-sky-dark" />
                  <span>{recurrenceEndDate ? shortDate(recurrenceEndDate) : 'Set end date'}</span>
                </button>
                {recurrenceEndDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecurrenceEndDate(null);
                      setRecurrence((prev) => (prev ? { ...prev, endDate: null } : null));
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-ink-sub hover:text-err-ink hover:bg-err-ink/10 active:bg-err-ink/20 transition-colors"
                    title="Clear end date"
                    aria-label="Clear end date"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                )}
              </div>
            </div>
          )}
        </FormField>

        <FormField label="Room">
          <ChipGroup
            label="Room"
            value={area}
            onChange={setArea}
            options={[{ label: 'None', value: null as string | null }, ...ROOMS.map((r) => ({ label: r.name, value: r.name as string | null, icon: r.icon, iconColor: r.fg }))]}
          />
        </FormField>

        <FormField
          label="Consumable item"
          hint={
            selectedItem
              ? `Current stock: ${selectedItem.currentStock ?? 0} ${usageUnit}`
              : items.length > 0
                ? 'Automatically deduct from stock when task is completed'
                : 'No items in inventory yet. Add items in Inventory to link consumable stock.'
          }
        >
          <Select
            value={mappedItemId ?? ''}
            disabled={items.length === 0}
            onChange={(e) => {
              const val = e.target.value || null;
              setMappedItemId(val);
              if (val && (!mappedQuantity || mappedQuantity <= 0)) setMappedQuantity(1);
            }}
          >
            <option value="">{items.length === 0 ? 'None (No items in inventory)' : 'None'}</option>
            {items.map((it) => {
              const uUnit = it.usageUnit?.trim() || it.unit || '';
              const stockLabel = it.currentStock != null ? `(${it.currentStock} ${uUnit} in stock)` : '';
              return (
                <option key={it.id} value={it.id}>
                  {it.name} {stockLabel}
                </option>
              );
            })}
          </Select>
          {selectedItem && (
            <div className="flex items-center justify-between gap-3 p-3 mt-1.5 rounded-lg bg-soft border border-line">
              <div className="flex flex-col">
                <span className="text-label-md text-ink font-medium">Used per task</span>
                <span className="text-caption text-ink-sub">
                  Deduct {mappedQuantity} {usageUnit} when completed
                </span>
              </div>
              <Stepper
                value={mappedQuantity}
                onChange={setMappedQuantity}
                label="Used per task"
                min={1}
              />
            </div>
          )}
        </FormField>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="min-h-[44px] -my-2 flex items-center gap-1 text-label-md text-link font-medium self-start"
        >
          <Icon name={showMore ? 'expand_less' : 'expand_more'} className="text-[20px]" />
          {showMore ? 'Fewer details' : 'Notes, checklist'}
        </button>

        {showMore && (
          <>

            <FormField label="Checklist">
              <div className="flex flex-col gap-2">
                {checklist.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <TextInput
                      value={c.title}
                      aria-label={`Checklist step ${i + 1}`}
                      onChange={(e) => setChecklist((list) => list.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      onClick={() => setChecklist((list) => list.filter((x) => x.id !== c.id))}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-ink-sub active:bg-soft shrink-0"
                      aria-label={`Remove step ${c.title}`}
                    >
                      <Icon name="close" className="text-[20px]" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <TextInput
                    value={step}
                    onChange={(e) => setStep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addStep();
                      }
                    }}
                    placeholder="Add a step"
                    aria-label="New checklist step"
                    enterKeyHint="next"
                  />
                  <button
                    type="button"
                    onClick={addStep}
                    disabled={!step.trim()}
                    className={cx('w-11 h-11 flex items-center justify-center rounded-lg shrink-0 transition-colors', step.trim() ? 'bg-sky text-ink' : 'bg-soft text-ink-sub')}
                    aria-label="Add step"
                  >
                    <Icon name="add" className="text-[20px]" />
                  </button>
                </div>
              </div>
            </FormField>

            <FormField label="Notes" htmlFor="task-notes">
              <TextArea id="task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" maxLength={500} />
            </FormField>
          </>
        )}
        {/* Lets the keyboard's return key submit from the name field. */}
        <button type="submit" hidden />
      </form>

      <DatePickerModal
        open={endDatePickerOpen}
        onClose={() => setEndDatePickerOpen(false)}
        value={recurrenceEndDate || due}
        onChange={(d) => {
          setRecurrenceEndDate(d);
          setRecurrence((prev) => (prev ? { ...prev, endDate: d } : null));
          setEndDatePickerOpen(false);
        }}
        title="Repeat until"
      />
    </BottomSheet>
  );
}
