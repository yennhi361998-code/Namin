import { useState } from 'react';
import { FormField, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { cx, GhostButton, Icon, MemberAvatar } from '../components/ui';
import { useStore } from '../store';
import { toast } from '../store/ui';

export function HouseholdSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const household = useStore((s) => s.household);
  const members = useStore((s) => s.members);
  const currentMemberId = useStore((s) => s.currentMemberId);
  const { renameHousehold, addMember, renameMember, setCurrentMember, resetDemo } = useStore.getState();
  const [homeName, setHomeName] = useState(household.name);
  const [newMember, setNewMember] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const add = () => {
    const n = newMember.trim();
    if (!n) return;
    addMember(n);
    setNewMember('');
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Household">
      <div className="flex flex-col gap-6 pb-[env(safe-area-inset-bottom)]">
        <FormField label="Home name" htmlFor="home-name">
          <TextInput
            id="home-name"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            onBlur={() => renameHousehold(homeName)}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            maxLength={40}
            autoComplete="off"
          />
        </FormField>

        <div className="flex flex-col gap-2">
          <span className="text-label-md text-ink-sub font-medium">Members</span>
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 min-h-[56px]">
                <MemberAvatar member={m} size={32} />
                {editing === m.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      renameMember(m.id, editName);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    className="flex-1 min-h-[44px] bg-transparent text-body-md text-ink focus:outline-none border-b-[1.5px] border-sky-dark"
                    aria-label={`Rename ${m.name}`}
                    maxLength={30}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex-1 text-left min-h-[44px] text-body-md text-ink"
                    onClick={() => {
                      setEditing(m.id);
                      setEditName(m.name);
                    }}
                    aria-label={`${m.name}. Tap to rename`}
                  >
                    {m.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentMember(m.id)}
                  aria-pressed={m.id === currentMemberId}
                  className={cx('min-h-[36px] px-3 rounded-full text-label-sm border', m.id === currentMemberId ? 'bg-soft border-sky text-link font-semibold' : 'border-line text-ink-sub')}
                >
                  {m.id === currentMemberId ? "That's me" : 'This is me'}
                </button>
              </div>
            ))}
            <form
              className="flex items-center gap-2 px-3 min-h-[56px]"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <span className="w-8 h-8 rounded-full bg-soft text-sky-dark flex items-center justify-center">
                <Icon name="person_add" className="text-[18px]" />
              </span>
              <input
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Add a member"
                aria-label="New member name"
                className="flex-1 min-h-[44px] bg-transparent text-body-md text-ink placeholder:text-ink-sub focus:outline-none"
                maxLength={30}
              />
              {newMember.trim() && (
                <button type="submit" className="min-h-[36px] px-3 rounded-full bg-sky text-ink text-label-md font-semibold">
                  Add
                </button>
              )}
            </form>
          </div>
        </div>

        {confirmReset ? (
          <div className="rounded-xl bg-err p-3.5 flex flex-col gap-3">
            <p className="text-body-sm text-err-ink">This replaces everything with the demo household. It can't be undone.</p>
            <div className="flex gap-2">
              <GhostButton className="bg-surface" onClick={() => setConfirmReset(false)}>
                Cancel
              </GhostButton>
              <button
                type="button"
                className="min-h-[48px] w-full rounded-xl bg-err-ink text-white font-medium"
                onClick={() => {
                  resetDemo();
                  onClose();
                  toast({ title: 'Demo data restored' });
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <GhostButton icon="restart_alt" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </GhostButton>
        )}
      </div>
    </BottomSheet>
  );
}
