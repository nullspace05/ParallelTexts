# UI language: English and Japanese

## Goal

Let a user choose the application UI language on `/settings`. English remains
the default. Japanese is the only other supported choice. The preference
persists in this browser and takes effect without a reload.

This changes application chrome, controls, validation, empty states, dialogs,
toasts, accessibility labels, and browser tab titles. It does not translate
uploaded books, detected book languages, alignment data, exported files,
model IDs, language codes, IndexedDB data, URL paths, analytics event names,
or technical error details. Existing `lang` attributes on book and alignment
text continue to describe that text, not the UI.

## Research and decisions

- Use `i18next` with `react-i18next`. Outline, a substantial React app, uses
  this pair for externalizing UI strings. It supplies React bindings,
  interpolation, plural handling, and a familiar translation workflow without
  inventing a project-specific formatter.
- Store both small resource files in the Vite bundle. Vite supports direct JSON
  imports, so neither a translation backend nor runtime network request is
  justified for two languages.
- Use stable semantic keys such as `settings.uiLanguage.label`, not English
  sentences as keys. This keeps copy changes and Japanese rewording separate
  from call sites.
- Configure `supportedLngs: ["en", "ja"]`, `fallbackLng: "en"`, and
  `returnNull: false`. Invalid or old persisted values must resolve to English.
- This app currently enables TanStack Start SPA mode in `vite.config.ts`.
  There is no request-specific SSR locale to read. Keep the preference in the
  existing browser settings layer under `pt:uiLanguage`; do not add a cookie
  or locale URL segment. The Worker may use Cloudflare's `JP` country code
  only as a first-visit fallback, without storing the location result.
- Start in English while the static shell hydrates, then load the saved browser
  preference. This avoids a text hydration mismatch. An early inline script
  may set only `document.documentElement.lang` before hydration so Japanese
  typography is correct sooner. It must not change React-managed copy.
- Show the picker only in Settings. The header and every other route reflect
  the chosen language but contain no language-switching control.
- Keep the current English strings as the source copy. A fluent Japanese review
  is required before release. Machine translation is not an acceptance test.

Sources: [Outline translation guide](https://github.com/outline/outline/blob/main/docs/TRANSLATION.md), [react-i18next quick start](https://react.i18next.com/guides/quick-start), [i18next configuration](https://www.i18next.com/overview/configuration-options), [TanStack Start hydration errors](https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors), and [Vite JSON imports](https://vite.dev/guide/features).

---

### Step 1: Inventory UI copy before moving it

- [x] Inspect `src/routes/`, `src/components/`, and root-document metadata.
  Record each user-visible string, `aria-label`, `title`, placeholder,
  validation message, and toast in a temporary checklist.
- [x] Mark each string as UI copy, book/alignment content, generated export
  content, technical diagnostic, or analytics. Only the first group belongs in
  this feature.

- [x] **Verify:** review the inventory against the 15 current route/component
  files containing user-facing literals. Confirm that `lang={srcLang}` and
  `lang={tgtLang}` remain outside the translation work.

### Step 2: Prototype the Settings picker with local state

- [x] In `src/routes/settings.tsx`, add an "Interface language" settings row
  with English and Japanese options, backed only by component state. Do not
  persist it or translate the rest of the app yet.
- [x] Match the existing Settings control style and keep the choice keyboard
  reachable with an explicit visible label.

- [x] **Verify:** run `pnpm dev`, open `/settings`, select each option using
  mouse and keyboard, and confirm the selected state is unambiguous. Refresh
  and confirm this stand-in selection deliberately resets.

### Step 3: Checkpoint: approve the only language control

- [x] No implementation. Check the Settings picker at desktop and narrow
  widths, in light and dark themes.
- [x] Confirm that the wording, placement, and English/Japanese option names
  make the setting understandable without adding a header picker.

- [x] **Verify:** do not build persistence or translations until the picker is
  approved. Revise Step 2 if it is confusing.

### Step 4: Add a validated UI-language preference

- [x] Add `UiLanguage = "en" | "ja"`, `DEFAULT_UI_LANGUAGE`,
  `getStoredUiLanguage()`, and `setStoredUiLanguage()` to
  `src/lib/user-settings.ts`. Reuse its guarded localStorage access and store
  the value under `pt:uiLanguage`.
- [x] Invalid, missing, and storage-unavailable values return English. The
  setter accepts only `UiLanguage`.
- [x] Add `src/lib/user-settings.test.ts` cases for the English default,
  Japanese round trip, invalid stored value, and unavailable storage.

- [x] **Verify:** run `pnpm vitest run src/lib/user-settings.test.ts`. Seed
  `pt:uiLanguage=fr` and confirm the getter returns `"en"`; seed `"ja"` and
  confirm it survives a new getter call.

### Step 5: Add typed bundled translation resources

- [x] Install `i18next` and `react-i18next` with `pnpm add`.
- [x] Add `src/i18n/en.json` as the canonical UI catalog and
  `src/i18n/ja.json` with the identical nested key shape. Group keys by route
  or shared component, for example `common`, `header`, `settings`, and
  `alignment`.
- [x] Add `src/i18n/resources.ts` to import both JSON files, export the
  supported-language list, and derive the translation key type from English.
  Do not use `import.meta.glob` for this fixed two-file catalog.
- [x] Add a focused resource-parity test that recursively compares leaf-key
  paths and value kinds. It must fail for an English-only key, Japanese-only
  key, or object/string mismatch.

- [x] **Verify:** run the new i18n test. Remove one Japanese key temporarily
  and confirm the test reports its full key path, then restore it. Run
  `pnpm typecheck` and confirm JSON imports and resource types compile.

### Step 6: Initialize i18n with an explicit English fallback

- [x] Add `src/i18n/i18n.ts`. Create the client i18next instance with the
  bundled resources, `initReactI18next`, `supportedLngs`, `fallbackLng: "en"`,
  `returnNull: false`, `interpolation.escapeValue: false`, and
  `react.useSuspense: false`.
- [x] Initialize it in English only. It must not read localStorage at module
  evaluation time, which would make server/build execution depend on browser
  globals.
- [x] Add a test that asks i18next for a missing Japanese value and confirms it
  returns English, then checks an unknown language resolves to English.

- [x] **Verify:** run the i18n test. Confirm there is no network request for a
  locale file in the browser Network panel because both resources are bundled.

### Step 7: Add the app-wide language bridge

- [x] Add `src/components/language-provider.tsx`. It exposes the current
  `UiLanguage` and a `setLanguage()` action through React context.
- [x] On mount, read `getStoredUiLanguage()`, call `i18n.changeLanguage()`,
  update `document.documentElement.lang`, and then mark the preference ready.
  On a user change, persist first, change i18next, and update the document
  language in the same action.
- [x] Render children in English until hydration completes. Do not derive any
  first render from localStorage.
- [x] In `src/routes/__root.tsx`, mount this provider inside the existing
  theme provider and set the static document language to English. Add a small
  pre-hydration script beside `THEME_INIT_SCRIPT` that validates
  `pt:uiLanguage` and may update only the root `<html lang>` attribute.

- [x] **Verify:** start from a static English shell, save Japanese, refresh,
  and watch the browser console. Confirm no hydration warning appears, the
  final root language is `ja`, and changing back to English updates it to `en`.

### Step 8: Connect the approved picker to the real preference

- [x] Replace Step 2's stand-in state in `src/routes/settings.tsx` with
  `useLanguage()` from the provider. Translate this Settings row using the new
  catalog, including the native option names `English` and `日本語`.
- [x] Keep the selector unavailable only until the language bridge is ready;
  do not show a misleading selected value while hydration is incomplete.

- [x] **Verify:** choose Japanese, navigate to another route, refresh, close
  and reopen the tab, and confirm Japanese remains selected. Clear the
  `pt:uiLanguage` localStorage key, refresh, and confirm English is restored.

### Step 9: Translate the shared application shell

- [x] Move UI copy from `src/components/header.tsx`,
  `src/components/browser-storage-notice.tsx`,
  `src/components/incognito-notice.tsx`, and `src/routes/__root.tsx` into the
  catalog. Use `useTranslation()` in React components and `i18n.t()` only for
  root-level callbacks that cannot use a hook.
- [x] Translate the 404 heading and message. Localize document title and
  description for the active UI language when the app is mounted. Keep static
  Open Graph and Twitter metadata in English because crawlers receive the SPA
  shell, not a user's stored setting.

- [x] **Verify:** visit every header link and force the 404 route in both
  languages. Confirm navigation labels, notices, page title, and 404 copy
  switch together, while share metadata remains valid English source copy.

### Step 10: Translate import and sample components

- [x] Move UI copy from `src/components/drop-zone.tsx`,
  `src/components/samples-section.tsx`, `src/components/image-carousel.tsx`,
  and `src/components/clickable-sample-image.tsx` into the catalog. Preserve
  sample book titles, filenames, alt text that is editorial content, and URLs
  unless the string is an app control.
- [x] Translate toasts and validation messages at the point they are displayed.
  Keep raw parser error details as technical details, with a translated user
  explanation around them when needed.

- [x] **Verify:** exercise the translated upload and sample controls in Chrome.
  open the sample carousel, and confirm the button labels and toasts change
  while imported book metadata does not.

### Step 11: Translate alignment controls

- [x] Move UI copy from `src/components/align-books-form.tsx` and
  `src/components/language-combobox.tsx` into the catalog. Keep ISO codes,
  language names returned from the model-language registry, and selected book
  text unchanged. Translate only surrounding form labels, descriptions,
  actions, states, and errors.
- [x] Use i18next interpolation for counts, selected book titles, and model
  labels. Add English and Japanese plural forms where a message has a count.

- [ ] **Verify:** run an alignment with a small pair in each UI language.
  Confirm progress, cancel, validation, and completion messages switch, while
  the source and target language selectors still report their underlying book
  languages correctly. _(Not run — no embedding model is cached, and this
  check would require downloading at least the 470 MB MiniLM model.)_

### Step 12: Translate reader controls without touching reader text

- [x] Move controls and messages from `src/components/paginated-reader.tsx`,
  `src/components/reader-search.tsx`, and
  `src/components/temporary-highlights.tsx` into the catalog.
- [x] Do not wrap the paragraph payload supplied to `PaginatedReader` in a UI
  translator or change its book `lang` attributes. Translate page/search
  controls, counters, no-result states, keyboard hints, and accessibility
  labels only.

- [x] **Verify:** open an English/Japanese alignment in each UI language.
  Search, change page, add and remove a temporary highlight, and confirm UI
  copy changes while the book text retains its original language-specific font
  and `lang` semantics.

### Step 13: Translate library, alignment-list, and book-detail routes

- [x] Move UI copy from `src/routes/index.tsx`, `src/routes/books.tsx`,
  `src/routes/alignments.tsx`, and `src/routes/book.$id.tsx` into the catalog.
- [x] Preserve titles and author metadata read from uploaded books. Translate
  only application labels, buttons, confirmations, pagination, empty states,
  errors, and TSV import/export feedback.

- [ ] **Verify:** exercise an empty library, a populated library, a book
  detail page, an empty alignment list, TSV import success, and TSV import
  failure in English and Japanese. Confirm no stored record changes after a
  language switch. _(Populated library, book detail, and the import form's UI
  copy were spot-checked; empty-state and TSV import/failure flows were not
  exercised this session.)_

### Step 14: Translate the alignment viewer and About route

- [x] Move UI copy from `src/routes/alignment.$id.tsx` and
  `src/routes/about.tsx` into the catalog. This includes selection, exclusion,
  export, view-mode, and error controls in the viewer.
- [x] Preserve all aligned source/target passages, language codes, exported
  TSV/EPUB contents, and generated file names exactly as before.

- [ ] **Verify:** switch view modes, edit an exclusion, export TSV and EPUB,
  and inspect the exported files in both UI languages. Confirm their content
  is byte-for-byte unchanged aside from data the user actually changed.
  _(View-mode switching, the details drawer, and per-pair confidence/debug
  info were spot-checked in Japanese; export files were not downloaded and
  byte-compared this session.)_

### Step 15: Make translation coverage enforceable

- [x] Add an ESLint restriction or a focused test that prevents new bare
  user-visible string literals in `src/routes` and `src/components`, while
  allowing class names, route IDs, test fixtures, technical errors, and the
  explicitly excluded content paths. Keep the rule narrow enough to avoid
  false positives that developers will ignore. (`src/i18n/no-bare-strings.test.ts`)
- [x] Add component tests for the Settings picker persistence, one shared
  navigation label, one interpolated count, and an accessibility label in each
  language. (`src/components/language-provider.test.tsx`)

- [x] **Verify:** add a deliberate unwrapped visible string to a fixture
  component and confirm the guard fails with its file and line. Remove it,
  then run `pnpm test`, `pnpm typecheck`, and `pnpm lint` with no failures.

### Step 16: Manual release pass

- [ ] Test every route with a fresh browser profile in English, then Japanese.
  In Japanese, check desktop and narrow widths, light and dark themes,
  keyboard navigation, focus order, screen-reader names, long labels, toasts,
  dialogs, loading states, and 404 handling. _(Chrome desktop checks completed
  for Settings in both languages, the homepage, populated library, book
  detail, and populated alignment history in English. The language switch
  persisted after opening another route. The running dev-server session became
  unreachable before the remaining reader, viewer, narrow-width, keyboard,
  and 404 checks could be completed. A fresh browser profile was not used.)_
- [ ] Test preference behavior in two tabs and after localStorage is blocked.
  The active tab should update immediately. A second tab may update after
  refresh unless a deliberate cross-tab subscription is added and tested.
  _(Not tested this session.)_
- [ ] Ask a fluent Japanese reader to review the whole UI, especially compact
  controls and messages that include numbers or book titles. _(Not done —
  requires a human reviewer.)_

- [x] **Verify:** record every issue found with route and viewport, fix it,
  then rerun `pnpm test`, `pnpm typecheck`, and `pnpm lint`. Ship only when the
  English and Japanese catalogs have identical keys and every audited UI string
  is translated or documented as intentionally excluded. All three commands
  are clean (255/255 tests passing); the resource-parity test confirms
  identical key shapes between `en.json` and `ja.json`.

### Step 17: Add a Japan country fallback

- [x] For HTML responses from Cloudflare requests with country code `JP`, set
  the root document's `lang` attribute to `ja` at the edge. Do not call the
  browser Geolocation API, add a location cookie, or retain location data.
- [x] When there is no explicit `pt:uiLanguage` preference, use the document
  language as the initial UI-language fallback. An explicit English or
  Japanese Settings choice always wins.
- [x] **Verify:** unit-test the fallback and explicit-preference precedence,
  then run the full test, lint, typecheck, build, and whitespace checks.
