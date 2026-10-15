import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { cx, Icon, MemberAvatar } from '../components/ui';
import { MEMBER_AVATARS, MemberAvatarIcon } from '../lib/members';
import type { Member } from '../lib/types';
import { useStore } from '../store';

export function HouseholdSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const household = useStore((s) => s.household);
  const members = useStore((s) => s.members);
  const currentMemberId = useStore((s) => s.currentMemberId);

  const { renameHousehold, addMember, renameMember, setMemberAvatar, setCurrentMember } = useStore.getState();
  const [homeName, setHomeName] = useState(household.name);
  const [newMember, setNewMember] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [avatarMember, setAvatarMember] = useState<Member | null>(null);
  const [pickingNewMemberAvatar, setPickingNewMemberAvatar] = useState(false);

  const add = () => {
    const n = newMember.trim();
    if (!n) return;
    addMember(n, newMemberAvatar);
    setNewMember('');
    setNewMemberAvatar(null);
  };

  return (
    <>
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
                <button
                  type="button"
                  onClick={() => setAvatarMember(m)}
                  title="Choose member icon"
                  className="relative group rounded-full active:scale-95 transition-transform shrink-0"
                >
                  <MemberAvatar member={m} size={36} />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface border border-line-strong flex items-center justify-center text-[10px] text-ink-sub shadow-xs group-hover:bg-header">
                    <Icon name="edit" className="text-[10px]" />
                  </span>
                </button>

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
                    className="flex-1 text-left min-h-[44px] text-body-md text-ink truncate"
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
                  onClick={() => setAvatarMember(m)}
                  className="w-9 h-9 rounded-full border border-line bg-surface text-ink hover:bg-soft active:scale-95 transition-all flex items-center justify-center shrink-0"
                  title="Choose icon"
                  aria-label="Choose icon"
                >
                  {m.avatar && m.avatar !== 'initial' ? (
                    <MemberAvatarIcon id={m.avatar} size={18} />
                  ) : (
                    <span className="text-[12px] font-bold text-ink-sub">Aa</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentMember(m.id)}
                  aria-pressed={m.id === currentMemberId}
                  className={cx('min-h-[36px] px-3 rounded-full text-label-sm border shrink-0', m.id === currentMemberId ? 'bg-soft border-sky text-link font-semibold' : 'border-line text-ink-sub')}
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
              <button
                type="button"
                onClick={() => setPickingNewMemberAvatar(true)}
                className="w-9 h-9 rounded-full bg-soft text-ink flex items-center justify-center hover:bg-soft/80 shrink-0"
                title="Choose icon"
              >
                {newMemberAvatar && newMemberAvatar !== 'initial' ? (
                  <MemberAvatarIcon id={newMemberAvatar} size={18} />
                ) : (
                  <Icon name="person_add" className="text-[18px] text-sky-dark" />
                )}
              </button>
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

        {/* Settings Navigation */}
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-label-md text-ink-sub font-semibold">Preferences</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
            className="w-full flex items-center justify-between p-3.5 bg-surface rounded-2xl border border-line/60 hover:bg-canvas active:bg-soft transition-colors text-left group shadow-2xs cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-10 h-10 rounded-full bg-soft text-ink flex items-center justify-center shrink-0 shadow-2xs">
                <Icon name="settings" className="text-[20px] text-ink" />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-body-md font-semibold text-ink">Settings</span>
                <span className="text-caption text-ink-sub">
                  Budgets & preferences
                </span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
          </button>
        </div>
      </div>
    </BottomSheet>

    {avatarMember && (
      <BottomSheet
        open={!!avatarMember}
        onClose={() => setAvatarMember(null)}
        title={`Choose icon for ${avatarMember.name}`}
      >
        <div className="pb-6 pt-1">
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 py-2 max-h-[52vh] overflow-y-auto pr-0.5">
            {MEMBER_AVATARS.map((opt) => {
              const isSelected = (avatarMember.avatar ?? null) === opt.value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  onClick={() => {
                    setMemberAvatar(avatarMember.id, opt.value);
                    setAvatarMember(null);
                  }}
                  className={cx(
                    'w-[52px] h-[52px] mx-auto rounded-2xl flex items-center justify-center transition-all active:scale-95 border',
                    isSelected
                      ? 'bg-header border-header-ink/40 ring-2 ring-header-ink/30 text-header-ink shadow-xs'
                      : 'bg-surface border-line text-ink hover:bg-soft'
                  )}
                >
                  {opt.value ? (
                    <MemberAvatarIcon id={opt.value} size={24} />
                  ) : (
                    <span className="text-body-md font-bold text-ink">
                      {avatarMember.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    )}

    {pickingNewMemberAvatar && (
      <BottomSheet
        open={pickingNewMemberAvatar}
        onClose={() => setPickingNewMemberAvatar(false)}
        title="Choose icon for new member"
      >
        <div className="pb-6 pt-1">
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5 py-2 max-h-[52vh] overflow-y-auto pr-0.5">
            {MEMBER_AVATARS.map((opt) => {
              const isSelected = newMemberAvatar === opt.value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  onClick={() => {
                    setNewMemberAvatar(opt.value);
                    setPickingNewMemberAvatar(false);
                  }}
                  className={cx(
                    'w-[52px] h-[52px] mx-auto rounded-2xl flex items-center justify-center transition-all active:scale-95 border',
                    isSelected
                      ? 'bg-header border-header-ink/40 ring-2 ring-header-ink/30 text-header-ink shadow-xs'
                      : 'bg-surface border-line text-ink hover:bg-soft'
                  )}
                >
                  {opt.value ? (
                    <MemberAvatarIcon id={opt.value} size={24} />
                  ) : (
                    <span className="text-body-md font-bold text-ink">Aa</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    )}
  </>
  );
}
