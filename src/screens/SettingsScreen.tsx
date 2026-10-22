import { useRef, useState } from 'react';
import { PageHeader } from '../components/shell';
import { BottomSheet } from '../components/overlay';
import { cx, GhostButton, Icon, PrimaryButton } from '../components/ui';
import { formatVnd } from '../lib/money';
import type { FinanceScope } from '../lib/types';
import { useStore } from '../store';
import { openSheet, toast } from '../store/ui';
import { useSync, setBulkImporting, bulkSyncImportToCloud } from '../lib/sync';
import { exportToExcel, parseExcelFile, commitImport, type ImportPreviewData } from '../lib/excel';
import { getGeminiApiKey, setGeminiApiKey, maskApiKey } from '../lib/vision';
import { getNotificationSettings } from '../lib/notifications';

const BUDGET_PRESETS = [5_000_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000];

function formatBackupDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function SettingsScreen() {
  const householdBudget = useStore((s) => s.householdBudget);
  const personalBudget = useStore((s) => s.personalBudget);
  const setBudget = useStore((s) => s.setBudget);
  const { user, householdId, inviteCode, myWalletBackupMeta } = useSync();
  const [editingBudgetScope, setEditingBudgetScope] = useState<FinanceScope | null>(null);
  const [budgetString, setBudgetString] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiKeySheetOpen, setApiKeySheetOpen] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState(() => getGeminiApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [cleanPersonalBeforeImport, setCleanPersonalBeforeImport] = useState(true);

  const handleOpenBudget = (scope: FinanceScope) => {
    setEditingBudgetScope(scope);
    const current = scope === 'household' ? householdBudget : personalBudget;
    setBudgetString(current && current > 0 ? String(current) : '');
  };

  const handleSaveBudget = () => {
    if (!editingBudgetScope) return;
    const clean = budgetString.replace(/\D/g, '');
    const amount = clean ? parseInt(clean, 10) : 0;
    setBudget(editingBudgetScope, amount > 0 ? amount : null);
    toast({
      title: amount > 0
        ? `${editingBudgetScope === 'household' ? 'Our Wallet' : 'My Wallet'} budget set to ${formatVnd(amount)}`
        : `${editingBudgetScope === 'household' ? 'Our Wallet' : 'My Wallet'} budget cleared`,
    });
    setEditingBudgetScope(null);
  };

  const handleClearBudget = () => {
    if (!editingBudgetScope) return;
    setBudget(editingBudgetScope, null);
    toast({
      title: `${editingBudgetScope === 'household' ? 'Our Wallet' : 'My Wallet'} budget cleared`,
    });
    setEditingBudgetScope(null);
  };

  const handleExport = () => {
    try {
      const filename = exportToExcel();
      toast({ title: 'Exported to Excel!', subtitle: filename });
    } catch (err: any) {
      console.error('Export failed:', err);
      toast({ title: 'Export failed', subtitle: err.message, tone: 'error' });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsReadingFile(true);
    try {
      const parsed = await parseExcelFile(file);
      const totalFound = parsed.ourWalletTxs.length + parsed.myWalletTxs.length + parsed.tasks.length;
      if (totalFound === 0) {
        toast({ title: 'No valid data found in file', subtitle: 'Ensure sheet names and columns match Namin format.', tone: 'error' });
        return;
      }
      setImportPreview(parsed);
      setCleanPersonalBeforeImport(true);
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      toast({ title: 'Failed to read file', subtitle: err.message, tone: 'error' });
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || isImporting) return;
    setIsImporting(true);
    setBulkImporting(true);
    try {
      // Short delay so user can see "Importing data..." with spinner
      await new Promise((r) => setTimeout(r, 60));

      const newAccs = importPreview.newAccounts?.length || 0;
      const newCats = importPreview.newCategories?.length || 0;
      const result = commitImport(importPreview, { cleanPersonalScope: cleanPersonalBeforeImport });

      // If user is connected to cloud household, push imported data via batch commit
      const syncState = useSync.getState();
      if (syncState.user && syncState.householdId) {
        try {
          await bulkSyncImportToCloud({
            userId: syncState.user.uid,
            householdId: syncState.householdId,
            importPreview,
            cleanPersonalScope: cleanPersonalBeforeImport,
          });
        } catch (syncErr) {
          console.warn('Cloud sync of imported data failed (will sync later):', syncErr);
        }
      }

      const extras: string[] = [];
      if (newAccs > 0) extras.push(`${newAccs} accounts`);
      if (newCats > 0) extras.push(`${newCats} categories`);
      if (result.addedItems > 0) extras.push(`${result.addedItems} items`);
      const extrasStr = extras.length > 0 ? `, ${extras.join(', ')}` : '';
      const summaryMsg = result.updatedTxs > 0
        ? `Linked ${result.updatedTxs} transactions, added ${result.addedTxs} new${extrasStr}.`
        : `Imported ${result.addedTxs} transactions${extrasStr} and ${result.addedTasks} tasks.`;
      toast({
        title: 'Import completed successfully!',
        subtitle: summaryMsg,
        tone: 'success',
      });
      setImportPreview(null);
    } catch (err: any) {
      console.error('Import commit failed:', err);
      toast({ title: 'Import failed', subtitle: err.message, tone: 'error' });
    } finally {
      setBulkImporting(false);
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-24">
      <PageHeader title="Settings" back="/" />
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />

      <main className="max-w-[560px] mx-auto pt-2">
        <div className="divide-y divide-line border-y border-line bg-transparent">
          {/* Family Pairing */}
          <button
            type="button"
            onClick={() => openSheet({ type: 'sync' })}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="diversity_3" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Family Pairing</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {user && householdId ? (
                <span className="flex items-center gap-1.5 text-body-sm text-done-ink font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {inviteCode ? `Paired (${inviteCode})` : 'Paired'}
                </span>
              ) : (
                <span className="text-body-sm text-ink-sub">
                  {user ? 'Setup' : 'Connect'}
                </span>
              )}
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Cloud Backup (My Wallet) */}
          <button
            type="button"
            onClick={() => openSheet({ type: 'backup' })}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="cloud_upload" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Cloud Backup</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {myWalletBackupMeta ? (
                <span className="flex items-center gap-1.5 text-body-sm text-done-ink font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {formatBackupDate(myWalletBackupMeta.backedUpAt)}
                </span>
              ) : (
                <span className="text-body-sm text-ink-sub">
                  {user ? 'Not backed up' : 'Sign in'}
                </span>
              )}
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={() => openSheet({ type: 'notification-settings' })}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="notifications" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Notifications</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cx('text-body-sm', getNotificationSettings().enabled ? 'text-done-ink font-medium' : 'text-ink-sub')}>
                {getNotificationSettings().enabled ? 'Active' : 'Off'}
              </span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Our Wallet Budget */}
          <button
            type="button"
            onClick={() => handleOpenBudget('household')}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="roofing" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Our Wallet Budget</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cx('text-body-sm', householdBudget && householdBudget > 0 ? 'text-ink font-medium' : 'text-ink-sub')}>
                {householdBudget && householdBudget > 0 ? formatVnd(householdBudget) : 'Not set'}
              </span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* My Wallet Budget */}
          <button
            type="button"
            onClick={() => handleOpenBudget('personal')}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="person" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">My Wallet Budget</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cx('text-body-sm', personalBudget && personalBudget > 0 ? 'text-ink font-medium' : 'text-ink-sub')}>
                {personalBudget && personalBudget > 0 ? formatVnd(personalBudget) : 'Not set'}
              </span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExport}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="download" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Export Excel (.xlsx)</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-body-sm text-ink-sub">Download</span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Import Excel */}
          <button
            type="button"
            disabled={isReadingFile}
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent disabled:opacity-60"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="upload" className="text-[20px] text-ink shrink-0" />
              <span className="text-body-md font-medium text-ink">Import Excel (.xlsx)</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-body-sm text-ink-sub">
                {isReadingFile ? 'Reading file...' : 'Select file'}
              </span>
              {isReadingFile ? (
                <Icon name="sync" className="text-[18px] text-sky-dark animate-spin" />
              ) : (
                <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
              )}
            </div>
          </button>

          {/* Gemini AI API Key */}
          <button
            type="button"
            onClick={() => {
              setGeminiApiKeyInput(getGeminiApiKey());
              setApiKeySheetOpen(true);
            }}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="sparkles" className="text-[20px] text-sky-dark shrink-0" />
              <span className="text-body-md font-medium text-ink">Gemini AI API Key</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cx('text-body-sm font-mono', getGeminiApiKey() ? 'text-done-ink font-medium' : 'text-ink-sub')}>
                {getGeminiApiKey() ? maskApiKey(getGeminiApiKey()) : 'Not set'}
              </span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>

          {/* Reset All Data */}
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-black/[0.03] active:bg-black/[0.06] text-left transition-colors cursor-pointer group bg-transparent"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Icon name="delete" className="text-[20px] text-err-ink shrink-0" />
              <span className="text-body-md font-medium text-err-ink">Reset All Data</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-body-sm text-ink-sub">Clear</span>
              <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink transition-colors" />
            </div>
          </button>
        </div>
      </main>

      {/* Budget Editor BottomSheet */}
      <BottomSheet
        open={!!editingBudgetScope}
        onClose={() => setEditingBudgetScope(null)}
        title={editingBudgetScope === 'household' ? 'Our Wallet Budget' : 'My Wallet Budget'}
        footer={
          <div className="flex items-center gap-2">
            <GhostButton className="flex-1" onClick={handleClearBudget}>
              Clear
            </GhostButton>
            <PrimaryButton className="flex-[2]" onClick={handleSaveBudget}>
              Save Budget
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col">
            <span className="text-caption font-semibold text-ink-sub uppercase tracking-wider">Monthly spending target</span>
            <span className="text-caption text-ink-muted mt-0.5">
              Enter the maximum budget for {editingBudgetScope === 'household' ? 'Our Wallet' : 'My Wallet'} per month.
            </span>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {BUDGET_PRESETS.map((p) => {
              const currentNum = parseInt(budgetString.replace(/\D/g, '') || '0', 10);
              const isSelected = currentNum === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBudgetString(String(p))}
                  className={cx(
                    'px-3 py-1.5 rounded-full text-caption font-semibold transition-all cursor-pointer',
                    isSelected
                      ? 'bg-header text-header-ink border border-header-ink/30 shadow-xs ring-2 ring-sky/30'
                      : 'bg-canvas text-ink-sub border border-line hover:bg-soft'
                  )}
                >
                  {formatVnd(p)}
                </button>
              );
            })}
          </div>

          {/* Formatted VND Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="budget-amount-input" className="text-body-sm font-semibold text-ink">
              Budget amount (VND)
            </label>
            <input
              id="budget-amount-input"
              type="text"
              inputMode="numeric"
              value={budgetString ? formatVnd(parseInt(budgetString.replace(/\D/g, '') || '0', 10)) : ''}
              onChange={(e) => {
                const clean = e.target.value.replace(/\D/g, '');
                setBudgetString(clean);
              }}
              placeholder="0 (Not set)"
              className="w-full min-h-[52px] px-4 rounded-xl bg-canvas border border-line text-headline-sm font-bold text-ink placeholder:text-ink-sub/60 focus:outline-none focus:border-sky-dark focus:bg-surface transition-colors"
            />
          </div>
        </div>
      </BottomSheet>

      {/* Import Preview BottomSheet */}
      {importPreview && (
        <BottomSheet
          open={!!importPreview}
          onClose={() => !isImporting && setImportPreview(null)}
          title="Import Excel Data"
          footer={
            <div className="flex items-center gap-2">
              <GhostButton className="flex-1" disabled={isImporting} onClick={() => !isImporting && setImportPreview(null)}>
                Cancel
              </GhostButton>
              <PrimaryButton className="flex-[2]" disabled={isImporting} onClick={handleConfirmImport}>
                {isImporting ? (
                  <>
                    <Icon name="sync" className="text-[20px] animate-spin" />
                    <span>Importing data...</span>
                  </>
                ) : (
                  'Import Data'
                )}
              </PrimaryButton>
            </div>
          }
        >
          <div className="flex flex-col gap-4 p-4">
            <div className="p-3 bg-canvas rounded-xl border border-line flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-sub uppercase tracking-wider">File Selected</span>
              <span className="text-body-md font-bold text-ink truncate">{importPreview.filename}</span>
            </div>

            <span className="text-body-sm font-semibold text-ink">Data found to import:</span>
            <div className="flex flex-col divide-y divide-line bg-surface rounded-xl border border-line">
              <div className="flex items-center justify-between p-3 text-body-sm">
                <span className="text-ink">Our Wallet Transactions</span>
                <span className="font-semibold text-ink">{importPreview.ourWalletTxs.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 text-body-sm">
                <span className="text-ink">My Wallet Transactions</span>
                <span className="font-semibold text-ink">{importPreview.myWalletTxs.length}</span>
              </div>
              {importPreview.newAccounts && importPreview.newAccounts.length > 0 && (
                <div className="flex items-center justify-between p-3 text-body-sm">
                  <span className="text-ink">Wallets & Accounts</span>
                  <span className="font-semibold text-done-ink">+{importPreview.newAccounts.length}</span>
                </div>
              )}
              {importPreview.newCategories && importPreview.newCategories.length > 0 && (
                <div className="flex items-center justify-between p-3 text-body-sm">
                  <span className="text-ink">Spending Categories</span>
                  <span className="font-semibold text-done-ink">+{importPreview.newCategories.length}</span>
                </div>
              )}
              <div className="flex items-center justify-between p-3 text-body-sm">
                <span className="text-ink">Household Tasks</span>
                <span className="font-semibold text-ink">{importPreview.tasks.length}</span>
              </div>
            </div>

            {importPreview.myWalletTxs.length > 0 && (
              <label className="flex items-start gap-3 p-3 bg-canvas rounded-xl border border-line cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cleanPersonalBeforeImport}
                  onChange={(e) => setCleanPersonalBeforeImport(e.target.checked)}
                  className="mt-0.5 rounded border-line text-sky accent-sky-dark shrink-0 w-4 h-4"
                />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-ink">
                    Refresh personal wallet (Recommended)
                  </span>
                  <span className="text-[12px] text-ink-sub leading-snug mt-0.5">
                    Replaces and accurately links all transaction sources & balances from your workbook.
                  </span>
                </div>
              </label>
            )}

            <p className="text-caption text-ink-sub">
              {cleanPersonalBeforeImport
                ? 'Personal wallet transactions will be refreshed cleanly from the Excel file. Our Wallet and tasks remain untouched.'
                : 'Matching transactions will be automatically updated with account links.'}
            </p>
          </div>
        </BottomSheet>
      )}

      {/* Gemini API Key Sheet */}
      <BottomSheet
        open={apiKeySheetOpen}
        onClose={() => setApiKeySheetOpen(false)}
        title="Gemini AI API Key"
        footer={
          <div className="flex items-center gap-2">
            <GhostButton
              className="flex-1"
              onClick={() => {
                setGeminiApiKey('');
                setGeminiApiKeyInput('');
                setApiKeySheetOpen(false);
                toast({ title: 'Gemini API Key removed' });
              }}
            >
              Remove Key
            </GhostButton>
            <PrimaryButton
              className="flex-[2]"
              disabled={!geminiApiKeyInput.trim()}
              onClick={() => {
                setGeminiApiKey(geminiApiKeyInput.trim());
                setApiKeySheetOpen(false);
                toast({ title: 'Gemini API Key saved!' });
              }}
            >
              Save Key
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <p className="text-body-sm text-ink-sub leading-relaxed">
            Google AI Studio API Key enables Namin to read receipts, bills, and bank transfer screenshots using AI Vision. Generous free tier included (15 requests/minute).
          </p>
          <div className="p-3 bg-sky/10 border border-sky/30 rounded-xl flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink font-medium">Get a free API Key (Google Account)</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-sky text-ink font-semibold text-[12px] shrink-0 hover:brightness-95 inline-flex items-center gap-1"
            >
              <span>Open Google AI</span>
              <Icon name="open_in_full" className="text-[12px]" />
            </a>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-ink-sub uppercase tracking-wider">
              Google Gemini API Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={geminiApiKeyInput}
                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                placeholder="Paste API Key (e.g. AIzaSy...)"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-line bg-surface text-body-md text-ink placeholder:text-ink-sub/60 focus:outline-none focus:border-sky-dark font-mono text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 p-1 text-ink-sub hover:text-ink transition-colors cursor-pointer"
                title={showApiKey ? 'Hide API Key' : 'Show API Key'}
              >
                <Icon name={showApiKey ? 'visibility_off' : 'visibility'} className="text-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Confirm Reset All Data BottomSheet */}
      <BottomSheet
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Reset All Data?"
        footer={
          <div className="flex items-center gap-2">
            <GhostButton className="flex-1" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </GhostButton>
            <PrimaryButton
              className="flex-1 !bg-err !text-white"
              onClick={() => {
                useStore.getState().resetDemo();
                setConfirmResetOpen(false);
                toast({ title: 'All data has been reset to empty.' });
              }}
            >
              Reset Everything
            </PrimaryButton>
          </div>
        }
      >
        <div className="p-4 flex flex-col gap-3">
          <p className="text-body-sm text-ink-sub leading-relaxed">
            This will permanently remove all transactions, tasks, shopping items, and inventory, giving you a fresh, clean slate.
          </p>
          <p className="text-caption text-err-ink font-medium">
            This action cannot be undone.
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}
