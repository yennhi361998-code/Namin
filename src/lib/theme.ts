export interface ThemeSettings {
  /** Canvas / app background color */
  canvasColor: string;
  /** Header band, active menu tab pill, and FAB '+' border ring */
  headerColor: string;
}

export const DEFAULT_CANVAS_COLOR = '#FFF8E1'; // Butter cream (vàng kem bơ)
export const DEFAULT_HEADER_COLOR = '#B5E7F1'; // Aqua Sky (xanh ngọc)

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  canvasColor: DEFAULT_CANVAS_COLOR,
  headerColor: DEFAULT_HEADER_COLOR,
};

export const THEME_STORAGE_KEY = 'namin:theme_settings';

export interface ColorOption {
  hex: string;
  name: string;
  isDefault?: boolean;
}

export const BACKGROUND_COLOR_OPTIONS: ColorOption[] = [
  { hex: '#FFF8E1', name: 'Butter Cream', isDefault: true },
  { hex: '#FFFFFF', name: 'Pure White' },
  { hex: '#FAE7EB', name: 'Soft Pink' },
  { hex: '#E0D4E7', name: 'Lavender' },
  { hex: '#C4BCB5', name: 'Warm Gray' },
  { hex: '#DFE1BE', name: 'Sage Green' },
  { hex: '#FFF5ED', name: 'Warm Cream' },
];

export const THEME_COLOR_OPTIONS: ColorOption[] = [
  { hex: '#B5E7F1', name: 'Aqua Sky', isDefault: true },
  { hex: '#FFFFFF', name: 'Pure White' },
  { hex: '#111111', name: 'Jet Black' },
  { hex: '#FAE7EB', name: 'Soft Pink' },
  { hex: '#E0D4E7', name: 'Lavender' },
  { hex: '#C4BCB5', name: 'Warm Gray' },
  { hex: '#DFE1BE', name: 'Sage Green' },
  { hex: '#FFF5ED', name: 'Warm Cream' },
  { hex: '#FFF8E1', name: 'Butter Cream' },
];

/**
 * Calculates relative luminance for WCAG contrast compliance.
 * Returns value between 0 (darkest black) and 1 (brightest white).
 */
export function getRelativeLuminance(hexColor: string): number {
  const clean = hexColor.replace('#', '').trim();
  if (clean.length !== 6 && clean.length !== 3) return 1;
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const r = parseInt(full.substring(0, 2), 16) / 255;
  const g = parseInt(full.substring(2, 4), 16) / 255;
  const b = parseInt(full.substring(4, 6), 16) / 255;
  const transform = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return transform(r) * 0.2126 + transform(g) * 0.7152 + transform(b) * 0.0722;
}

/**
 * Reads stored theme settings from localStorage.
 */
export function getThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      canvasColor: parsed.canvasColor || DEFAULT_CANVAS_COLOR,
      headerColor: parsed.headerColor || DEFAULT_HEADER_COLOR,
    };
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

/**
 * Persists theme settings to localStorage and applies CSS variables to DOM.
 */
export function saveThemeSettings(settings: ThemeSettings): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save theme settings to localStorage', e);
    }
  }
  applyTheme(settings);
}

/**
 * Converts hex color to space-separated RGB string ("r g b").
 */
export function hexToRgb(hexColor: string): string {
  const clean = hexColor.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `${r} ${g} ${b}`;
}

/**
 * Applies CSS variables directly to the root element.
 * Zero-lag repaint with GPU acceleration.
 */
export function applyTheme(settings: ThemeSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // 1. Canvas / App background
  root.style.setProperty('--color-canvas', settings.canvasColor);
  root.style.setProperty('--color-canvas-rgb', hexToRgb(settings.canvasColor));

  // 2. Header, active menu tab pill, and FAB '+' button border
  root.style.setProperty('--color-header', settings.headerColor);
  root.style.setProperty('--color-header-rgb', hexToRgb(settings.headerColor));

  // 3. Contrast calculation for text and icons sitting on Header
  const headerLum = getRelativeLuminance(settings.headerColor);
  const isDarkHeader = headerLum < 0.4;
  const headerInk = isDarkHeader ? '#FFFFFF' : '#175562';
  root.style.setProperty('--color-header-ink', headerInk);
  root.style.setProperty('--color-header-ink-rgb', hexToRgb(headerInk));

  // 4. Logo in BrandHeader
  // When header is pure white or very pale cream, white logo is invisible.
  // Switch to headerInk so it remains beautifully visible.
  const isWhiteHeader = headerLum > 0.88;
  const logoColor = isWhiteHeader ? headerInk : '#FFFFFF';
  root.style.setProperty('--color-header-logo', logoColor);

  // 5. Update mobile browser chrome/notch color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', settings.headerColor);
  }
}
