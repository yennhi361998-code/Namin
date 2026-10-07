# Namin

Household tasks, shopping and spending in one place. Simple on the surface, smart underneath.

Mobile-first PWA (installable to the home screen, works offline), implemented from the Stitch "Pastel Sky Hearth" design.

```bash
npm install
npm run dev      # http://localhost:5173 (this machine only)
npm run dev:host # same, also reachable on your Wi-Fi to try it on a phone
npm test         # recurrence, restock, money parsing, store flows
npm run build
npm run preview  # serves the build with the service worker (not active in dev)
```

## Offline

`vite-plugin-pwa` (configured in `vite.config.ts`) generates `sw.js` at build time and precaches the whole app shell (JS, CSS, HTML, icons, woff2 fonts). Routes like `/tasks` fall back to `index.html`, so every screen opens without a network. The manifest stays hand-written in `public/manifest.webmanifest`. New builds activate automatically on the next launch.

## Icons and fonts

- **Icons**: [Lucide](https://lucide.dev) everywhere (`lucide-react`). `src/components/icons.ts` maps the app's icon names to Lucide components: `UI_ICONS` for controls, rooms and the tab bar, `CATEGORY_ICONS` for money categories (keys are the ids stored on categories). Adding an icon = one line there; an unknown name is a type error.
- **Fonts** (bundled via Fontsource, no network needed): `Be Vietnam Pro` for all text.
- **Logo**: the house + heart mark lives in `src/lib/logoMark.json`, drawn by `src/components/Logo.tsx` (header) and by `npm run icons` (`scripts/build-icons.mjs`), which writes the favicon, iOS and Android/PWA icons into `public/`.

## Structure

| Path | What lives there |
|---|---|
| `src/lib/` | Pure domain logic: types, dates, recurrence, restock estimate, VND parsing, category guessing |
| `src/store/index.ts` | Zustand store: all data + actions, persisted to `localStorage` (`namin:data`) |
| `src/store/selectors.ts` | Derived data (task lists, restock map, monthly spending) |
| `src/store/actions.ts` | Actions that also give feedback (toast + Undo) |
| `src/store/seed.ts` | Demo household, dated relative to first launch |
| `src/components/` | UI kit (buttons, rows, bottom sheet, snackbar, swipe row, forms) |
| `src/screens/` | Home, Tasks, Task detail, Shopping, Item detail, Charts |
| `src/sheets/` | Bottom sheets: task, shopping item, purchase, item edit, household, add expense/income, categories |

To move to a backend, replace the `persist` storage in `src/store/index.ts`; screens only talk to store actions.

## How the smart parts work

- **Recurring tasks**: completing an occurrence creates the next one (same settings, fresh checklist) at the first interval step after today. Undo removes it again.
- **Calendar (Tasks tab)**: `lib/calendar.ts` + `useTasksByDay`. Only the current occurrence of a recurring task is stored; later repeats are projected for display (dashed checkbox). Ticking one stores a completed record for that date only, and the series skips that date when it gets there. Occurrences share a `seriesId` (data v2; v1 data migrates automatically).
- **Charts (Shopping → View charts)**: expenses and income per category per month (`moneyForMonth` in `store/selectors.ts`). Shopping purchases count as expenses under the spending category picked when saving (default Daily, remembered per item). Categories are editable; removed ones are archived so history keeps them. Chart colours come from a 6-colour palette validated for colour-blind separation; clashes within one chart take the next free colour.
- **Keypad**: `lib/calc.ts` evaluates `+ − × ÷` with normal precedence.
- **Restock**: `lib/restock.ts`. Average gap between purchases on distinct days. Needs ≥ 2 purchases, or 1 purchase plus a manual "usually lasts" value. No estimate otherwise.
- **Running low**: estimated next purchase within 7 days.

## Not built yet

- Reminders are stored and shown but don't fire notifications.
- No sync between devices; data is per browser.
