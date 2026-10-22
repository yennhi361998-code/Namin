import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  NOTIFICATION_CASES,
  saveNotificationSettings,
} from '../lib/notifications';

function createMockLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      store[key] = String(val);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}

describe('notification settings and specs', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mockStorage = createMockLocalStorage();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('window', {
      location: { href: 'http://localhost/' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('defaults all notification toggles to false (OFF) and sets expected default times', () => {
    const s = DEFAULT_NOTIFICATION_SETTINGS;
    expect(s.enabled).toBe(false);

    // Group 1: Tasks
    expect(s.morningBriefing).toBe(false);
    expect(s.morningBriefingTime).toBe('08:30');
    expect(s.assignedByPartner).toBe(false);
    expect(s.periodicMaintenance).toBe(false);
    expect(s.taskCompletedByPartner).toBe(false);

    // Group 2: Shopping
    expect(s.runningLowForecast).toBe(false);
    expect(s.outOfStock).toBe(false);
    expect(s.liveCartUpdate).toBe(false);

    // Group 3: Finance
    expect(s.upcomingBill).toBe(false);
    expect(s.budgetAlert).toBe(false);

    // Group 4: AI
    expect(s.eveningAiScanNudge).toBe(false);
    expect(s.eveningAiScanTime).toBe('21:30');
  });

  it('persists customized notification settings in localStorage', () => {
    saveNotificationSettings({
      enabled: true,
      morningBriefing: true,
      morningBriefingTime: '08:45',
      budgetAlert: true,
    });

    const loaded = getNotificationSettings();
    expect(loaded.enabled).toBe(true);
    expect(loaded.morningBriefing).toBe(true);
    expect(loaded.morningBriefingTime).toBe('08:45');
    expect(loaded.budgetAlert).toBe(true);
    // untouched fields remain default false
    expect(loaded.outOfStock).toBe(false);
  });

  it('has exact titles, bodies, and target routes matching user specification', () => {
    // Case 1.1: Morning Briefing
    expect(NOTIFICATION_CASES.morningBriefing.title).toBe("Today's Household Plan");
    expect(NOTIFICATION_CASES.morningBriefing.url).toBe('/tasks');

    // Case 1.2: Assigned by partner
    expect(NOTIFICATION_CASES.assignedByPartner.title).toBe('New Task from {Partner}');
    expect(NOTIFICATION_CASES.assignedByPartner.url).toBe('/tasks');

    // Case 1.3: Periodic Maintenance
    expect(NOTIFICATION_CASES.periodicMaintenance.title).toBe('Maintenance Reminder: Air Conditioner');
    expect(NOTIFICATION_CASES.periodicMaintenance.url).toBe('/tasks');

    // Case 1.4: Task Completed by Partner
    expect(NOTIFICATION_CASES.taskCompletedByPartner.title).toBe('Task Completed');
    expect(NOTIFICATION_CASES.taskCompletedByPartner.url).toBe('/tasks');

    // Case 2.1: Running Low Forecast
    expect(NOTIFICATION_CASES.runningLowForecast.title).toBe('Restock Alert: Running Low');
    expect(NOTIFICATION_CASES.runningLowForecast.url).toBe('/inventory');

    // Case 2.2: Out of Stock
    expect(NOTIFICATION_CASES.outOfStock.title).toBe('Out of Stock: Dishwasher Tablets');
    expect(NOTIFICATION_CASES.outOfStock.url).toBe('/inventory');

    // Case 2.3: Live Cart Update
    expect(NOTIFICATION_CASES.liveCartUpdate.title).toBe('Shopping List Updated');
    expect(NOTIFICATION_CASES.liveCartUpdate.url).toBe('/shopping');

    // Case 3.1: Upcoming Bill
    expect(NOTIFICATION_CASES.upcomingBill.title).toBe('Upcoming Bill: Electricity');
    expect(NOTIFICATION_CASES.upcomingBill.url).toBe('/finance');

    // Case 3.2: Budget Threshold Alert
    expect(NOTIFICATION_CASES.budgetAlert.title).toBe('Budget Alert');
    expect(NOTIFICATION_CASES.budgetAlert.url).toBe('/finance');

    // Case 4.1: Evening AI Scan Nudge
    expect(NOTIFICATION_CASES.eveningAiScanNudge.title).toBe('Evening Spend Catch-Up');
    expect(NOTIFICATION_CASES.eveningAiScanNudge.body).toBe('Got any receipts or mobile banking screenshots today?');
    expect(NOTIFICATION_CASES.eveningAiScanNudge.url).toBe('/finance');
  });
});
