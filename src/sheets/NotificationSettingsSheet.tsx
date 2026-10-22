import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, Icon, PrimaryButton } from '../components/ui';
import {
  getNotificationPermission,
  getNotificationSettings,
  isNotificationSupported,
  requestNotificationPermission,
  saveNotificationSettings,
  type NotificationSettings,
} from '../lib/notifications';
import { toast } from '../store/ui';

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'w-11 h-6 rounded-full transition-colors relative shrink-0 focus:outline-none p-0.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? 'bg-sky-dark' : 'bg-line-strong/60',
      )}
    >
      <span
        className={cx(
          'block w-5 h-5 rounded-full bg-surface shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function NotificationSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<NotificationSettings>(() => getNotificationSettings());
  const [permission, setPermission] = useState<NotificationPermission>(() => getNotificationPermission());

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    const next = saveNotificationSettings({ [key]: value });
    setSettings(next);
  };

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      updateSetting('enabled', true);
      toast({ title: 'Notifications enabled' });
    } else if (res === 'denied') {
      toast({
        title: 'Permission blocked',
        subtitle: 'Please enable notifications in your browser or system settings.',
        tone: 'error',
      });
    }
  };

  const supported = isNotificationSupported();

  return (
    <BottomSheet open={open} onClose={onClose} title="Notification Settings">
      <div className="flex flex-col gap-6 pb-[env(safe-area-inset-bottom)] text-ink">
        {/* Support Alert / Permission Box */}
        {!supported ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-body-sm text-amber-900 flex items-start gap-2.5">
            <Icon name="info" className="text-[18px] text-amber-600 shrink-0 mt-0.5" />
            <span>Web Push notifications are not supported on this browser. On iPhone, make sure to add Namin to your Home Screen first.</span>
          </div>
        ) : permission !== 'granted' ? (
          <div className="p-4 rounded-xl bg-sky/20 border border-sky/30 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-label-md font-semibold text-header-ink">
              <Icon name="notifications" className="text-[20px] text-sky-dark shrink-0" />
              <span>Allow System Notifications</span>
            </div>
            <p className="text-body-sm text-ink-sub">
              Enable notifications to receive gentle updates for household tasks, inventory restocks, and bills.
            </p>
            <PrimaryButton onClick={handleRequestPermission}>
              Enable Notifications
            </PrimaryButton>
          </div>
        ) : null}

        {/* Master Switch */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-line shadow-card">
          <span className="text-body-md font-semibold text-ink">Allow Notifications</span>
          <Toggle
            checked={settings.enabled && permission === 'granted'}
            disabled={permission !== 'granted'}
            onChange={(val) => updateSetting('enabled', val)}
          />
        </div>

        {/* 1. Tasks & Chores */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Icon name="checklist" className="text-[16px] text-sky-dark" />
            <span className="text-label-md font-semibold text-ink">1. Tasks & Chores</span>
          </div>
          <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden shadow-card">
            {/* Case 1.1: Morning Briefing */}
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-body-sm font-medium text-ink">Morning Briefing</span>
                  <span className="text-caption text-ink-sub">Summary of chores due today</span>
                </div>
                <Toggle
                  checked={settings.enabled && settings.morningBriefing}
                  disabled={!settings.enabled || permission !== 'granted'}
                  onChange={(val) => updateSetting('morningBriefing', val)}
                />
              </div>
              {settings.morningBriefing && (
                <div className="flex items-center justify-between pt-2 border-t border-line/40 text-caption">
                  <span className="text-ink-sub font-medium">Send time</span>
                  <input
                    type="time"
                    value={settings.morningBriefingTime || '08:30'}
                    onChange={(e) => updateSetting('morningBriefingTime', e.target.value)}
                    className="px-2 py-1 rounded bg-canvas border border-line text-label-sm font-semibold tabular-nums text-ink focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Case 1.2: Assigned by Partner */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Assigned by Partner</span>
                <span className="text-caption text-ink-sub">When your partner assigns a chore to you</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.assignedByPartner}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('assignedByPartner', val)}
              />
            </div>

            {/* Case 1.3: Periodic Maintenance */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Periodic Maintenance</span>
                <span className="text-caption text-ink-sub">1, 3, or 6-month appliance cleaning reminders</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.periodicMaintenance}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('periodicMaintenance', val)}
              />
            </div>

            {/* Case 1.4: Task Completed by Partner */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Partner Completed Chore</span>
                <span className="text-caption text-ink-sub">When your partner finishes a major chore</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.taskCompletedByPartner}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('taskCompletedByPartner', val)}
              />
            </div>
          </div>
        </div>

        {/* 2. Shopping & Smart Restock */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Icon name="add_shopping_cart" className="text-[16px] text-sky-dark" />
            <span className="text-label-md font-semibold text-ink">2. Shopping & Smart Restock</span>
          </div>
          <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden shadow-card">
            {/* Case 2.1: Running Low Forecast */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Running Low Forecast</span>
                <span className="text-caption text-ink-sub">When consumption cycle predicts ≤ 7 days left</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.runningLowForecast}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('runningLowForecast', val)}
              />
            </div>

            {/* Case 2.2: Out of Stock */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Out of Stock Alert</span>
                <span className="text-caption text-ink-sub">When stock hits 0 or due date passed</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.outOfStock}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('outOfStock', val)}
              />
            </div>

            {/* Case 2.3: Live Cart Update */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Live Cart Update</span>
                <span className="text-caption text-ink-sub">When partner adds new items to the shopping list</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.liveCartUpdate}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('liveCartUpdate', val)}
              />
            </div>
          </div>
        </div>

        {/* 3. Finance & Spending */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Icon name="paid" className="text-[16px] text-sky-dark" />
            <span className="text-label-md font-semibold text-ink">3. Finance & Spending</span>
          </div>
          <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden shadow-card">
            {/* Case 3.1: Upcoming Bill */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Upcoming Bill Reminder</span>
                <span className="text-caption text-ink-sub">1–2 days before utility / rent due dates</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.upcomingBill}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('upcomingBill', val)}
              />
            </div>

            {/* Case 3.2: Budget Threshold Alert */}
            <div className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-body-sm font-medium text-ink">Budget Threshold Alert</span>
                <span className="text-caption text-ink-sub">When category spend reaches 90% or 100% of budget</span>
              </div>
              <Toggle
                checked={settings.enabled && settings.budgetAlert}
                disabled={!settings.enabled || permission !== 'granted'}
                onChange={(val) => updateSetting('budgetAlert', val)}
              />
            </div>
          </div>
        </div>

        {/* 4. AI Assistant & Habit */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Icon name="sparkles" className="text-[16px] text-sky-dark" />
            <span className="text-label-md font-semibold text-ink">4. AI Assistant & Habit</span>
          </div>
          <div className="bg-surface rounded-xl border border-line divide-y divide-line overflow-hidden shadow-card">
            {/* Case 4.1: Evening AI Scan Nudge */}
            <div className="p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-body-sm font-medium text-ink">Evening AI Scan Nudge</span>
                  <span className="text-caption text-ink-sub">Gentle reminder if no expenses logged today</span>
                </div>
                <Toggle
                  checked={settings.enabled && settings.eveningAiScanNudge}
                  disabled={!settings.enabled || permission !== 'granted'}
                  onChange={(val) => updateSetting('eveningAiScanNudge', val)}
                />
              </div>
              {settings.eveningAiScanNudge && (
                <div className="flex items-center justify-between pt-2 border-t border-line/40 text-caption">
                  <span className="text-ink-sub font-medium">Reminder time</span>
                  <input
                    type="time"
                    value={settings.eveningAiScanTime || '21:30'}
                    onChange={(e) => updateSetting('eveningAiScanTime', e.target.value)}
                    className="px-2 py-1 rounded bg-canvas border border-line text-label-sm font-semibold tabular-nums text-ink focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
