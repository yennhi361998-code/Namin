import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, Icon, PrimaryButton } from '../components/ui';
import { useSync } from '../lib/sync';
import { useStore } from '../store';
import { toast } from '../store/ui';

export function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    user,
    householdId,
    householdName,
    inviteCode,
    status,
    lastSyncedAt,
    error,
    loginWithGoogle,
    loginWithEmail,
    logout,
    createCloudHousehold,
    joinCloudHousehold,
    clearError,
  } = useSync();

  const currentHomeName = useStore((s) => s.household.name);
  const members = useStore((s) => s.members);
  const currentMemberId = useStore((s) => s.currentMemberId);
  const setCurrentMember = useStore((s) => s.setCurrentMember);

  // Email form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Household create / join state
  const [newHomeName, setNewHomeName] = useState(currentHomeName || 'Our Home');
  const [inputCode, setInputCode] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [copied, setCopied] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Please enter email and password', tone: 'error' });
      return;
    }
    clearError();
    await loginWithEmail(email, password, authMode === 'signup', displayName);
  };

  const handleCreate = async () => {
    try {
      await createCloudHousehold(newHomeName);
    } catch (e) {
      /* handled in sync store */
    }
  };

  const handleJoin = async () => {
    if (!inputCode.trim()) {
      toast({ title: 'Please enter the invite code', tone: 'error' });
      return;
    }
    try {
      await joinCloudHousehold(inputCode);
      setInputCode('');
    } catch (e) {
      /* handled in sync store */
    }
  };

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      toast({ title: 'Invite code copied!', subtitle: 'Send this code to your partner to join.' });
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Family Cloud Sync">
      <div className="flex flex-col gap-5 pb-8 pt-1">
        {/* Error notice if any */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-body-sm flex items-start gap-2.5">
            <Icon name="error" className="text-[20px] text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Sync Error</span>
              <span className="text-caption text-rose-700">{error}</span>
            </div>
            <button type="button" onClick={clearError} className="text-rose-500 hover:text-rose-700 text-caption font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* 1. NOT AUTHENTICATED */}
        {!user && (
          <div className="flex flex-col gap-5">
            <div className="p-4 bg-header/20 border border-header-ink/20 rounded-2xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-header-ink font-bold text-body-md">
                <Icon name="sync" className="text-[20px]" />
                <span>Multi-Device Family Sync</span>
              </div>
              <p className="text-caption text-ink leading-relaxed">
                Log in to synchronize <strong>Tasks</strong> and <strong>Our Wallet</strong> in real-time between devices.
                Your <strong>My Wallet</strong> data is protected by strict security rules and remains 100% private to you.
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={loginWithGoogle}
              className="w-full min-h-[48px] px-4 rounded-xl border border-line bg-surface text-ink hover:bg-canvas active:scale-[0.99] transition-all flex items-center justify-center gap-3 font-semibold text-body-md shadow-xs cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-line" />
              <span className="text-[11px] font-bold text-ink-sub uppercase tracking-wider">or email</span>
              <div className="flex-1 h-px bg-line" />
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
              <div className="flex bg-surface rounded-xl p-1 border border-line">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className={cx(
                    'flex-1 py-1.5 rounded-lg text-caption font-semibold transition-all',
                    authMode === 'signin' ? 'bg-header text-header-ink shadow-2xs' : 'text-ink-sub hover:text-ink'
                  )}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={cx(
                    'flex-1 py-1.5 rounded-lg text-caption font-semibold transition-all',
                    authMode === 'signup' ? 'bg-header text-header-ink shadow-2xs' : 'text-ink-sub hover:text-ink'
                  )}
                >
                  Create Account
                </button>
              </div>

              {authMode === 'signup' && (
                <div className="flex flex-col gap-1">
                  <label className="text-caption font-semibold text-ink-sub">Your Name (e.g. Alex)</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full min-h-[44px] px-3 rounded-xl bg-surface border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-caption font-semibold text-ink-sub">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-surface border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-caption font-semibold text-ink-sub">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-surface border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
                />
              </div>

              <PrimaryButton
                type="submit"
                disabled={status === 'loading'}
                className="w-full mt-2 min-h-[44px]"
              >
                {status === 'loading'
                  ? 'Connecting...'
                  : authMode === 'signup'
                  ? 'Create Account & Sign In'
                  : 'Sign In'}
              </PrimaryButton>
            </form>
          </div>
        )}

        {/* 2. AUTHENTICATED */}
        {user && (
          <div className="flex flex-col gap-5">
            {/* Account Card */}
            <div className="p-3.5 bg-surface rounded-2xl border border-line flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-soft text-ink flex items-center justify-center font-bold text-body-md shrink-0 border border-line">
                  {user.displayName ? user.displayName.slice(0, 1).toUpperCase() : user.email?.slice(0, 1).toUpperCase() || 'U'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-body-md font-semibold text-ink truncate">
                    {user.displayName || 'Logged in user'}
                  </span>
                  <span className="text-caption text-ink-sub truncate">{user.email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="px-3 py-1.5 rounded-full border border-line text-caption font-semibold text-ink-sub hover:text-ink hover:bg-canvas active:bg-soft transition-colors shrink-0"
              >
                Sign out
              </button>
            </div>

            {/* Case A: Already in a household */}
            {householdId ? (
              <div className="flex flex-col gap-4">
                {/* Active Sync Status Box */}
                <div className="p-4 bg-done/25 border border-done/40 rounded-2xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-done-ink font-bold text-body-md">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      Household Synced
                    </span>
                    <span className="text-caption text-done-ink/80 font-medium">
                      {lastSyncedAt ? 'Live' : 'Active'}
                    </span>
                  </div>
                  <span className="text-body-sm font-semibold text-ink">
                    Home: {householdName || currentHomeName}
                  </span>
                </div>

                {/* Invite Code Share Card */}
                {inviteCode && (
                  <div className="p-4 bg-surface rounded-2xl border border-line flex flex-col gap-3 shadow-card">
                    <div className="flex flex-col">
                      <span className="text-caption font-bold text-ink-sub uppercase tracking-wider">
                        Household Invite Code
                      </span>
                      <span className="text-caption text-ink-muted mt-0.5">
                        Share this code with your partner or family member so they can join on their phone:
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 bg-canvas rounded-xl border border-line">
                      <span className="font-mono text-headline-sm font-bold text-header-ink tracking-widest pl-1">
                        {inviteCode}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className={cx(
                          'px-4 py-2 rounded-xl text-caption font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                          copied
                            ? 'bg-done text-done-ink'
                            : 'bg-header text-header-ink hover:bg-header/80 active:scale-95 shadow-xs'
                        )}
                      >
                        <Icon name={copied ? 'check' : 'share'} className="text-[16px]" />
                        <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Member selection on this device */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col">
                    <span className="text-body-sm font-bold text-ink">Who is using this device?</span>
                    <span className="text-caption text-ink-sub">
                      Select your profile so tasks and budget stats recognize your activities:
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {members.map((m) => {
                      const isMe = m.id === currentMemberId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setCurrentMember(m.id);
                            toast({ title: `Active profile set to ${m.name}` });
                          }}
                          className={cx(
                            'p-3 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer text-left',
                            isMe
                              ? 'bg-header/20 border-header-ink/40 ring-2 ring-header-ink/30 shadow-xs'
                              : 'bg-surface border-line hover:bg-canvas'
                          )}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-caption shrink-0"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-body-sm font-bold text-ink truncate">{m.name}</span>
                            <span className="text-caption text-ink-sub">{isMe ? "That's you" : 'Tap to switch'}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Privacy Guarantee Note */}
                <div className="p-3.5 bg-canvas rounded-2xl border border-line/60 flex items-start gap-2.5 text-caption text-ink-sub">
                  <Icon name="lock" className="text-[18px] text-ink-sub shrink-0 mt-0.5" />
                  <span>
                    <strong>Strict Privacy:</strong> Only Tasks, Shopping, and Our Wallet are shared.
                    Your My Wallet transactions are encrypted to your personal account ID and cannot be viewed by other household members.
                  </span>
                </div>
              </div>
            ) : (
              /* Case B: Logged in, but needs to create or join a household */
              <div className="flex flex-col gap-4">
                {/* Switch between Create or Join */}
                <div className="flex bg-surface rounded-xl p-1 border border-line">
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className={cx(
                      'flex-1 py-2 rounded-lg text-body-sm font-semibold transition-all',
                      activeTab === 'create' ? 'bg-header text-header-ink shadow-2xs' : 'text-ink-sub hover:text-ink'
                    )}
                  >
                    1. Create Household
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('join')}
                    className={cx(
                      'flex-1 py-2 rounded-lg text-body-sm font-semibold transition-all',
                      activeTab === 'join' ? 'bg-header text-header-ink shadow-2xs' : 'text-ink-sub hover:text-ink'
                    )}
                  >
                    2. Join with Code
                  </button>
                </div>

                {activeTab === 'create' ? (
                  <div className="p-4 bg-surface rounded-2xl border border-line flex flex-col gap-3 shadow-2xs">
                    <span className="text-body-md font-bold text-ink">Start syncing your household</span>
                    <p className="text-caption text-ink-sub leading-relaxed">
                      This uploads your current local tasks and Our Wallet to Firebase and creates a shareable invite code for other family members.
                    </p>

                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-caption font-semibold text-ink-sub">Household Name</label>
                      <input
                        type="text"
                        value={newHomeName}
                        onChange={(e) => setNewHomeName(e.target.value)}
                        placeholder="Our Home"
                        className="w-full min-h-[44px] px-3 rounded-xl bg-canvas border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
                      />
                    </div>

                    <PrimaryButton
                      type="button"
                      disabled={status === 'syncing'}
                      onClick={handleCreate}
                      className="w-full mt-2 min-h-[44px]"
                    >
                      {status === 'syncing' ? 'Syncing to Cloud...' : 'Create & Enable Sync'}
                    </PrimaryButton>
                  </div>
                ) : (
                  <div className="p-4 bg-surface rounded-2xl border border-line flex flex-col gap-3 shadow-2xs">
                    <span className="text-body-md font-bold text-ink">Join your family's household</span>
                    <p className="text-caption text-ink-sub leading-relaxed">
                      Enter the 6-character Invite Code displayed on your partner's phone (e.g. NM-7K9P).
                    </p>

                    <div className="flex flex-col gap-1 mt-1">
                      <label className="text-caption font-semibold text-ink-sub">Invite Code</label>
                      <input
                        type="text"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                        placeholder="NM-XXXX"
                        maxLength={10}
                        className="w-full min-h-[48px] px-3 rounded-xl bg-canvas border border-line text-headline-sm font-mono font-bold text-center tracking-widest text-ink focus:outline-none focus:border-sky-dark uppercase"
                      />
                    </div>

                    <PrimaryButton
                      type="button"
                      disabled={status === 'syncing' || !inputCode.trim()}
                      onClick={handleJoin}
                      className="w-full mt-2 min-h-[44px]"
                    >
                      {status === 'syncing' ? 'Connecting...' : 'Join Household'}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
