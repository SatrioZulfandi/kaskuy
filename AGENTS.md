# AGENTS.md — Panduan & Aturan Wajib AI Agent (Kaskuy / CatatKeuangan)

This is an Expo/React Native mobile application (**Kaskuy / CatatKeuangan** — aplikasi pencatatan keuangan pribadi offline-first dengan fitur utama scan struk fisik on-device menggunakan OCR + koreksi Levenshtein Distance + validasi aritmetika).
Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Always read [`PERENCANAAN.md`](./PERENCANAAN.md) for the complete product specification, database schema, OCR pipeline design, and the 8 required Dashboard/Report deliverables.

---

## 🚨 CRITICAL: Native Binary & Zero-Recompile Rules (DO NOT VIOLATE)

The user runs this app on a **pre-compiled Android Development Build APK (`com.anonymous.catatkeuangan`)**.
Adding or directly calling any native module that is NOT already compiled into the installed APK binary will immediately crash the app with `IllegalViewOperationException` (Fabric ViewManager missing) or `UnavailabilityError`.

### 1. Native Modules Compiled in the Current APK (Allowed)
Only the following native modules exist in the running Android APK binary:
- `expo-sqlite`
- `expo-mlkit-ocr`
- `expo-image`
- `expo-image-picker`
- `expo-image-manipulator`
- `react-native-safe-area-context`
- `react-native-screens`
- `react-native-reanimated`
- `react-native-gesture-handler`
- `@expo/ui`

### 2. Forbidden Direct Native Imports & Mandatory Safe Wrappers
- **NEVER install or import `expo-camera`** or other new native packages unless the user explicitly asks to rebuild the Android APK (`npx expo run:android`). For camera capture & gallery selection, **ALWAYS use `expo-image-picker`** (`launchCameraAsync` / `launchImageLibraryAsync` with `allowsEditing: true`).
- **NEVER import `expo-linear-gradient` directly** in screens or components.
  - **ALWAYS use `src/components/ui/LinearGradient.tsx`**, which checks `UIManager.getViewManagerConfig` and safely falls back to a solid `#0052CC` `View` when the native view manager is absent from the APK.
- **NEVER import `expo-haptics` directly** in screens or components.
  - **ALWAYS use `src/lib/haptics.ts`** (`import { Haptics } from '.../lib/haptics'`), which wraps async promises in `try / await / catch` so missing native haptic modules never trigger unhandled promise rejections.
- **NEVER import `react-native-svg` directly** without checking `UIManager.getViewManagerConfig('RNSVGSvgView')`.
  - **ALWAYS use `src/components/ui/Icon.tsx`** for icons. `Icon.tsx` encodes SVG markup into Base64 Data URIs (`data:image/svg+xml;base64,...`) and renders them via `expo-image` (Android Glide `Base64DataFetcher` **requires** Base64, NOT `utf8,` URL-encoded strings).
  - **ALWAYS use `src/components/decorative/BatikPattern.tsx`** for the Kawung batik pattern overlay.
- **NEVER import from `@react-navigation/native` or `@react-navigation/*`**.
  - As of Expo SDK 56/57, `expo-router` is no longer compatible with direct `@react-navigation/*` imports. Always import `ThemeProvider`, `DarkTheme`, `DefaultTheme`, `Stack`, `Tabs`, `router`, `Link`, `useLocalSearchParams`, and `useFocusEffect` from `expo-router`.

---

## 📐 UI, Styling & Layout Rules

1. **Theme Tokens (`src/constants/theme.ts`)**:
   - **NEVER delete or rename exports in `src/constants/theme.ts`**: `Colors`, `Radius`, `Spacing`, `Typography`, `Fonts`, `BottomTabInset`, `MaxContentWidth`.
   - Maintain both semantic keys (`Spacing.xs`, `Spacing.sm`, `Radius.sm`, `Radius.md`, `Radius.lg`, `Radius.xl`) and legacy keys (`Spacing.one`, `Spacing.two`, etc.).
2. **Safe Area & Status Bar (`src/hooks/useTopInset.ts`)**:
   - React Native's built-in `<SafeAreaView>` has `0` top inset on Android.
   - **Every screen header MUST use `useTopInset(12)`** from `src/hooks/useTopInset.ts` and apply `{ paddingTop: topInset }` to the top header / `heroGradient` container so content never collides with the Android status bar or camera punch-hole.
3. **Visual Identity**:
   - Modern mobile banking aesthetic (deep navy `#1B365D` / royal blue `#0052CC` & `#0066FF`).
   - Minimalist outline SVG icons via `<Icon name="..." />` — **no emojis** in UI navigation or category icons.
   - Subtle Indonesian Kawung batik pattern (`<BatikPattern />`) only on hero balance cards and empty states with low opacity (`0.06` – `0.08`).
   - Bottom navigation bar (`src/components/navigation/CustomTabBar.tsx`) has 4 tabs (`Beranda`, `Dompet`, `Laporan`, `Pengaturan`) plus a raised center `Scan` button (`#1B365D` circle with white border).

---

## 🗂️ Project Structure & Architecture

```text
src/
├── app/                        # Expo Router screens (routes ONLY)
│   ├── _layout.tsx             # Root Stack layout + useDatabase() init
│   ├── (tabs)/                 # Bottom tab screens
│   │   ├── _layout.tsx         # CustomTabBar configuration
│   │   ├── index.tsx           # Beranda (Dashboard 1: Ringkasan Keuangan)
│   │   ├── wallet.tsx          # Dompet (Daftar & total saldo dompet)
│   │   ├── report.tsx          # Laporan (Dashboard 2, 3, 4, 5, 6, 8)
│   │   └── settings.tsx        # Pengaturan & akses penguji OCR
│   ├── scan/
│   │   ├── index.tsx           # Alur Scan Struk OCR + Konfirmasi + Adaptive Learning
│   │   └── test-ocr.tsx        # Layar debug OCR mentah
│   ├── transaction/
│   │   ├── add.tsx             # Form tambah transaksi manual + custom keypad
│   │   └── [id].tsx            # Detail & hapus transaksi (otomatis revert saldo dompet)
│   ├── wallet/
│   │   ├── add.tsx             # Form tambah dompet baru
│   │   └── [id].tsx            # Detail dompet & riwayat (Dashboard 7)
│   └── budget/
│       └── add.tsx             # Form atur budget bulanan per kategori
├── components/
│   ├── decorative/BatikPattern.tsx
│   ├── navigation/CustomTabBar.tsx
│   └── ui/                     # Button, Card, Icon, AmountDisplay, EmptyState, LinearGradient
├── constants/theme.ts          # Design tokens (Colors, Radius, Spacing, Typography)
├── db/
│   ├── database.ts             # SQLite singleton & initialization
│   ├── schema.ts               # 8 SQLite tables
│   ├── seeds.ts                # Default book, wallets, categories, merchant dictionary
│   └── repositories/           # CRUD repositories (book, wallet, category, transaction, budget, scanResult, ocrCorrection, merchantDict)
├── hooks/
│   ├── useDatabase.ts          # DB initialization hook
│   └── useTopInset.ts          # Safe status bar top padding hook
├── lib/
│   ├── currency.ts             # Format Rupiah (Rp X.XXX.XXX)
│   ├── date.ts                 # Filter rentang tanggal (Harian/Mingguan/Bulanan/Tahunan)
│   ├── haptics.ts              # Safe Haptics wrapper
│   └── parseReceipt.ts         # On-device OCR receipt parser (Levenshtein + validasi aritmetika)
└── types/index.ts              # Shared TypeScript interfaces
```

- **Do NOT recreate `src/app/index.tsx` or `src/app/explore.tsx`** — the home route is `src/app/(tabs)/index.tsx`. Creating `src/app/index.tsx` causes duplicate route conflicts in Expo Router.

---

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json` (currently **SDK 57**).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

**Run `npx tsc --noEmit` and `npx expo lint` before declaring any task done.** Both must pass with 0 errors and 0 warnings.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## General Rules

- Do not edit native `ios/` or `android/` directories by hand unless explicitly requested — configure native behavior in `app.json` and config plugins.
- Prefer existing installed modules and safe internal wrappers (`LinearGradient`, `Haptics`, `Icon`, `useTopInset`) over adding new dependencies.
