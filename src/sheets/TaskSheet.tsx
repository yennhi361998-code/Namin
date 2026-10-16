import { useRef, useState } from 'react';
import { DatePicker, FormField, Select, Stepper, TextArea, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { ChipGroup, cx, Icon, PrimaryButton } from '../components/ui';
import { formatDuration, today } from '../lib/dates';
import { uid } from '../lib/id';
import { ROOMS } from '../lib/rooms';
import { RECURRENCE_PRESETS, recurrenceLabel, sameRecurrence } from '../lib/recurrence';
import type { DateStr, Recurrence } from '../lib/types';
import { useStore, type TaskInput } from '../store';
import { toast } from '../store/ui';

const DURATIONS = [5, 15, 30, 45, 60];

export function TaskSheet({ open, onClose, taskId, dueDate }: { open: boolean; onClose: () => void; taskId?: string; dueDate?: DateStr }) {
  const existing = useStore((s) => (taskId ? s.tasks.find((t) => t.id === taskId) : undefined));
  const existingChecklist = useStore((s) => s.checklist);
  const items = useStore((s) => s.items);
  const members = useStore((s) => s.members);
  const currentMemberId = useStore((s) => s.currentMemberId);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(existing ? existing.assigneeId : currentMemberId);
  const [due, setDue] = useState<DateStr>(existing?.dueDate ?? dueDate ?? today());
  const [recurrence, setRecurrence] = useState<Recurrence | null>(existing?.recurrence ?? null);
  const [mappedItemId, setMappedItemId] = useState<string | null>(existing?.mappedItemId ?? null);
  const [mappedQuantity, setMappedQuantity] = useState<number>(existing?.mappedQuantity ?? 1);
  const [reminder, setReminder] = useState<string | null>(existing?.reminder ?? null);
  const [duration, setDuration] = useState<number | null>(existing?.estimatedDuration ?? null);
  const [area, setArea] = useState<string | null>(existing?.area ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const [checklist, setChecklist] = useState(() =>
    existing ? existingChecklist.filter((c) => c.taskId === existing.id).map((c) => ({ id: c.id, title: c.title, completed: c.completed })) : [],
  );
  const [step, setStep] = useState('');
  const [showMore, setShowMore] = useState(
    !!existing && !!(existing.reminder || existing.estimatedDuration || existing.notes || checklist.length),
  );
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  // Keep a custom recurrence (e.g. every 3 months) selectable when editing.
  const presets =
    recurrence && !RECURRENCE_PRESETS.some((p) => sameRecurrence(p.value, recurrence))
      ? [...RECURRENCE_PRESETS, { label: recurrenceLabel(recurrence), value: recurrence }]
      : RECURRENCE_PRESETS;

  const addStep = () => {
    if (!step.trim()) return;
    setChecklist((c) => [...c, { id: uid(), title: step.trim(), completed: false }]);
    setStep('');
  };

  const submit = () => {
    if (submitted.current) return;
    if (!title.trim()) {
      setError('Give the task a name.');
      return;
    }
    submitted.current = true;
    const all = step.trim() ? [...checklist, { id: uid(), title: step.trim(), completed: false }] : checklist;
    const input: TaskInput = {
      title,
      assigneeId,
      dueDate: due,
      recurrence,
      reminder,
      estimatedDuration: duration,
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
            options={[...members.map((m) => ({ label: m.id === currentMemberId ? `${m.name} (you)` : m.name, value: m.id as string | null, dot: m.color })), { label: 'Anyone', value: null }]}
          />
        </FormField>

        <FormField label="Due date">
          <DatePicker label="Due date" value={due} onChange={setDue} />
        </FormField>

        <FormField label="Repeat" hint={recurrence ? `${recurrenceLabel(recurrence, due)}. The next one is scheduled when you complete this.` : undefined}>
          <ChipGroup label="Repeat" value={recurrence} onChange={setRecurrence} isEqual={sameRecurrence} options={presets} />
        </FormField>

        <FormField label="Room">
          <ChipGroup
            label="Room"
            value={area}
            onChange={setArea}
            options={[{ label: 'None', value: null as string | null }, ...ROOMS.map((r) => ({ label: r.name, value: r.name as string | null, icon: r.icon, iconColor: r.fg }))]}
          />
        </FormField>

        {items.length > 0 && (
          <FormField
            label="Consumable item"
            hint={
              selectedItem
                ? `Current stock: ${selectedItem.currentStock ?? 0} ${usageUnit}`
                : 'Automatically deduct from stock when task is completed'
            }
          >
            <Select
              value={mappedItemId ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                setMappedItemId(val);
                if (val && (!mappedQuantity || mappedQuantity <= 0)) setMappedQuantity(1);
              }}
            >
              <option value="">None</option>
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
        )}


        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="min-h-[44px] -my-2 flex items-center gap-1 text-label-md text-link font-medium self-start"
        >
          <Icon name={showMore ? 'expand_less' : 'expand_more'} className="text-[20px]" />
          {showMore ? 'Fewer details' : 'Reminder, duration, notes, checklist'}
        </button>

        {showMore && (
          <>
            <FormField label="Reminder" htmlFor="task-reminder">
              <div className="flex items-center gap-2">
                <TextInput
                  id="task-reminder"
                  type="time"
                  value={reminder ?? ''}
                  onChange={(e) => setReminder(e.target.value || null)}
                  className="max-w-[160px]"
                />
                {reminder && (
                  <button type="button" onClick={() => setReminder(null)} className="min-h-[44px] px-3 text-label-md text-ink-sub">
                    Clear
                  </button>
                )}
              </div>
            </FormField>

            <FormField label="Estimated duration">
              <ChipGroup
                label="Estimated duration"
                value={duration}
                onChange={setDuration}
                options={[{ label: 'None', value: null as number | null }, ...DURATIONS.map((d) => ({ label: formatDuration(d), value: d as number | null }))]}
              />
            </FormField>

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
    </BottomSheet>
  );
}
