import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, GhostButton, Icon, PrimaryButton } from '../components/ui';
import { useSync } from '../lib/sync';
import { useStore } from '../store';
import { formatVnd } from '../lib/money';
import { toast } from '../store/ui';

function formatBackupDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    user,
    myWalletBackupMeta,
    isBackingUp,
    isRestoring,
    loginWithGoogle,
    loginWithEmail,
    backupMyWalletToCloud,
    restoreMyWalletFromCloud,
  } = useSync();

  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const personalBudget = useStore((s) => s.personalBudget);

  const localPersonalTxs = transactions.filter((t) => t.scope === 'personal');
  const localPersonalAccounts = accounts.filter((a) => a.scope === 'personal');

  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  // Email form state (if not logged in)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Please enter email and password', tone: 'error' });
      return;
    }
    await loginWithEmail(email, password, authMode === 'signup');
  };

  const handleBackup = async () => {
    try {
      await backupMyWalletToCloud();
    } catch {
      // Toast is already shown inside backupMyWalletToCloud
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMyWalletFromCloud();
      setConfirmRestoreOpen(false);
    } catch {
      // Toast is already shown inside restoreMyWalletFromCloud
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Cloud Backup">
      <div className="flex flex-col gap-5 pb-8 pt-1">
        {/* Case 1: User not authenticated */}
        {!user ? (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-header/20 border border-header-ink/20 rounded-2xl flex flex-col gap-2">
              <div className="flex items-center gap-2 text-header-ink font-bold text-body-md">
                <Icon name="lock" className="text-[20px]" />
                <span>Private Cloud Backup</span>
              </div>
              <p className="text-caption text-ink leading-relaxed">
                Sign in to backup your <strong>My Wallet</strong> transactions, accounts, and budget to your private Google/Firebase account.
                This data is 100% private and never shared with other family members.
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={loginWithGoogle}
              className="w-full min-h-[48px] px-4 rounded-xl border border-line bg-surface text-ink hover:bg-canvas active:scale-[0.99] transition-all flex items-center justify-center gap-3 font-semibold text-body-md shadow-xs cursor-pointer"
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

            {/* Email form */}
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="h-px bg-line flex-1" />
                <span className="text-caption uppercase tracking-wider text-ink-sub font-semibold">or email</span>
                <div className="h-px bg-line flex-1" />
              </div>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-surface border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-surface border border-line text-body-md text-ink focus:outline-none focus:border-sky-dark"
              />

              <PrimaryButton type="submit" className="w-full min-h-[44px]">
                {authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </PrimaryButton>

              <div className="flex justify-center text-caption text-ink-sub">
                <button
                  type="button"
                  onClick={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                  className="hover:text-ink underline"
                >
                  {authMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Case 2: User is authenticated */
          <div className="flex flex-col gap-4">
            {/* Account badge */}
            <div className="flex items-center justify-between p-3.5 bg-canvas rounded-xl border border-line">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-header/30 flex items-center justify-center text-header-ink font-bold text-caption">
                  {(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-body-sm font-bold text-ink truncate">
                    {user.displayName || user.email?.split('@')[0] || 'User'}
                  </span>
                  <span className="text-caption text-ink-sub truncate">{user.email}</span>
                </div>
              </div>
              <span className="text-caption font-semibold px-2 py-0.5 rounded-full bg-done/20 text-done-ink border border-done/40 shrink-0">
                Connected
              </span>
            </div>

            {/* Current local data summary */}
            <div className="p-4 bg-surface rounded-2xl border border-line flex flex-col gap-3 shadow-2xs">
              <span className="text-caption uppercase tracking-wider font-bold text-ink-sub">
                My Wallet on this device
              </span>
              <div className="grid grid-cols-2 gap-3 text-body-sm">
                <div className="p-3 bg-canvas rounded-xl border border-line/60 flex flex-col">
                  <span className="text-caption text-ink-sub">Personal Transactions</span>
                  <span className="text-headline-sm font-bold text-ink mt-0.5">
                    {localPersonalTxs.length}
                  </span>
                </div>
                <div className="p-3 bg-canvas rounded-xl border border-line/60 flex flex-col">
                  <span className="text-caption text-ink-sub">Personal Accounts</span>
                  <span className="text-headline-sm font-bold text-ink mt-0.5">
                    {localPersonalAccounts.length}
                  </span>
                </div>
              </div>
              {personalBudget && personalBudget > 0 && (
                <div className="flex items-center justify-between px-1 text-caption text-ink-sub">
                  <span>Monthly Budget:</span>
                  <span className="font-semibold text-ink">{formatVnd(personalBudget)}</span>
                </div>
              )}
            </div>

            {/* Cloud Backup Status */}
            <div className="p-4 bg-surface rounded-2xl border border-line flex flex-col gap-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-caption uppercase tracking-wider font-bold text-ink-sub">
                  Cloud Backup Status
                </span>
                {myWalletBackupMeta && (
                  <span className="flex items-center gap-1.5 text-caption font-semibold text-done-ink">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Backed Up
                  </span>
                )}
              </div>

              {myWalletBackupMeta ? (
                <div className="flex flex-col gap-1 p-3 bg-canvas rounded-xl border border-line/60">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-ink-sub">Last backup:</span>
                    <span className="font-semibold text-ink">
                      {formatBackupDate(myWalletBackupMeta.backedUpAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-caption text-ink-sub">
                    <span>Snapshot contains:</span>
                    <span>
                      {myWalletBackupMeta.transactionsCount} transactions · {myWalletBackupMeta.accountsCount} accounts
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-canvas rounded-xl border border-line/60 text-body-sm text-ink-sub">
                  No backup found on Cloud yet. Tap &ldquo;Backup to Cloud&rdquo; to save a copy of your personal wallet.
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <PrimaryButton
                  type="button"
                  disabled={isBackingUp || isRestoring}
                  onClick={handleBackup}
                  className="w-full min-h-[46px] flex items-center justify-center gap-2"
                >
                  <Icon name={isBackingUp ? 'sync' : 'cloud_upload'} className={cx('text-[20px]', isBackingUp && 'animate-spin')} />
                  <span>{isBackingUp ? 'Backing up to Cloud...' : 'Backup to Cloud'}</span>
                </PrimaryButton>

                <button
                  type="button"
                  disabled={!myWalletBackupMeta || isBackingUp || isRestoring}
                  onClick={() => setConfirmRestoreOpen(true)}
                  className="w-full min-h-[44px] rounded-xl border border-line bg-surface text-ink hover:bg-canvas active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-semibold text-body-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name={isRestoring ? 'sync' : 'download'} className={cx('text-[20px]', isRestoring && 'animate-spin')} />
                  <span>{isRestoring ? 'Restoring from Cloud...' : 'Restore from Cloud'}</span>
                </button>
              </div>
            </div>

            {/* Privacy note */}
            <div className="p-3.5 bg-canvas rounded-2xl border border-line/60 flex items-start gap-2.5 text-caption text-ink-sub">
              <Icon name="lock" className="text-[18px] text-ink-sub shrink-0 mt-0.5" />
              <span>
                <strong>100% Private:</strong> Your My Wallet backup is stored securely under your personal Google account.
                Other family members in your Family Pairing cannot access or view your personal wallet backup.
              </span>
            </div>
          </div>
        )}

        {/* Confirmation Modal before Restoring */}
        {confirmRestoreOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-[360px] bg-surface rounded-2xl p-5 border border-line shadow-float flex flex-col gap-3">
              <span className="text-body-md font-bold text-ink">Restore My Wallet?</span>
              <p className="text-body-sm text-ink-sub leading-relaxed">
                This will download the cloud snapshot ({myWalletBackupMeta?.transactionsCount} transactions) and merge them with your current personal transactions on this device.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <GhostButton type="button" onClick={() => setConfirmRestoreOpen(false)}>
                  Cancel
                </GhostButton>
                <PrimaryButton type="button" disabled={isRestoring} onClick={handleRestore}>
                  {isRestoring ? 'Restoring...' : 'Confirm Restore'}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
