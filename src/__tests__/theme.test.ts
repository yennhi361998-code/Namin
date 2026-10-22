import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyTheme,
  BACKGROUND_COLOR_OPTIONS,
  DEFAULT_CANVAS_COLOR,
  DEFAULT_HEADER_COLOR,
  DEFAULT_THEME_SETTINGS,
  getRelativeLuminance,
  getThemeSettings,
  hexToRgb,
  saveThemeSettings,
  THEME_COLOR_OPTIONS,
  THEME_STORAGE_KEY,
  type ThemeSettings,
} from '../lib/theme';

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

describe('theme system', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;
  let styleStore: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = createMockLocalStorage();
    styleStore = {};
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('window', {
      localStorage: mockStorage,
    });
    vi.stubGlobal('document', {
      documentElement: {
        style: {
          setProperty: vi.fn((prop: string, val: string) => {
            styleStore[prop] = val;
          }),
          getPropertyValue: vi.fn((prop: string) => styleStore[prop] || ''),
        },
      },
      querySelector: vi.fn(() => null),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('has correct default colors (Butter Cream yellow and Aqua Sky blue)', () => {
    expect(DEFAULT_CANVAS_COLOR).toBe('#FFF8E1');
    expect(DEFAULT_HEADER_COLOR).toBe('#B5E7F1');
    expect(DEFAULT_THEME_SETTINGS).toEqual({
      canvasColor: '#FFF8E1',
      headerColor: '#B5E7F1',
    });
  });

  it('includes all user-specified colors in Theme options, and excludes Jet Black from Background', () => {
    const bgRequiredColors = [
      '#FFFFFF',
      '#FAE7EB',
      '#E0D4E7',
      '#C4BCB5',
      '#DFE1BE',
      '#FFF5ED',
    ];

    const bgHexes = BACKGROUND_COLOR_OPTIONS.map((c) => c.hex.toUpperCase());
    const themeHexes = THEME_COLOR_OPTIONS.map((c) => c.hex.toUpperCase());

    // Background should contain all required pastel colors and default yellow
    for (const req of bgRequiredColors) {
      expect(bgHexes).toContain(req);
    }
    expect(bgHexes).toContain('#FFF8E1');

    // Jet Black should be excluded from Background options
    expect(bgHexes).not.toContain('#111111');

    // Theme options should contain Jet Black and all required options
    for (const req of [...bgRequiredColors, '#111111']) {
      expect(themeHexes).toContain(req);
    }
    expect(themeHexes).toContain('#B5E7F1');
  });

  it('converts hex colors to RGB format accurately', () => {
    expect(hexToRgb('#FFF8E1')).toBe('255 248 225');
    expect(hexToRgb('#B5E7F1')).toBe('181 231 241');
    expect(hexToRgb('#111111')).toBe('17 17 17');
    expect(hexToRgb('#FFFFFF')).toBe('255 255 255');
  });

  it('calculates relative luminance for WCAG contrast correctly', () => {
    expect(getRelativeLuminance('#000000')).toBe(0);
    expect(getRelativeLuminance('#FFFFFF')).toBeCloseTo(1, 4);
    expect(getRelativeLuminance('#111111')).toBeLessThan(0.05);
    expect(getRelativeLuminance('#B5E7F1')).toBeGreaterThan(0.7);
  });

  it('reads and persists settings to localStorage', () => {
    expect(getThemeSettings()).toEqual(DEFAULT_THEME_SETTINGS);

    const custom: ThemeSettings = {
      canvasColor: '#FFFFFF',
      headerColor: '#E0D4E7',
    };
    saveThemeSettings(custom);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify(custom));
    expect(getThemeSettings()).toEqual(custom);
  });

  it('applies CSS variables to DOM and adapts contrast dynamically', () => {
    // 1. Default light theme
    applyTheme(DEFAULT_THEME_SETTINGS);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-canvas')).toBe('#FFF8E1');
    expect(root.style.getPropertyValue('--color-canvas-rgb')).toBe('255 248 225');
    expect(root.style.getPropertyValue('--color-header')).toBe('#B5E7F1');
    expect(root.style.getPropertyValue('--color-header-rgb')).toBe('181 231 241');
    expect(root.style.getPropertyValue('--color-header-ink')).toBe('#175562');
    expect(root.style.getPropertyValue('--color-header-logo')).toBe('#FFFFFF');

    // 2. Dark header (#111111): ink must flip to white #FFFFFF
    applyTheme({ canvasColor: '#FFFFFF', headerColor: '#111111' });
    expect(root.style.getPropertyValue('--color-header')).toBe('#111111');
    expect(root.style.getPropertyValue('--color-header-ink')).toBe('#FFFFFF');
    expect(root.style.getPropertyValue('--color-header-logo')).toBe('#FFFFFF');

    // 3. Pure white header (#FFFFFF): logo must be tinted #175562 so it does not disappear
    applyTheme({ canvasColor: '#FFF5ED', headerColor: '#FFFFFF' });
    expect(root.style.getPropertyValue('--color-header')).toBe('#FFFFFF');
    expect(root.style.getPropertyValue('--color-header-ink')).toBe('#175562');
    expect(root.style.getPropertyValue('--color-header-logo')).toBe('#175562');
  });
});
