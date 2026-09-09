# Saved text selections

This plan adds a local highlights collection for book and alignment readers.
Each saved item stores one or more text segments. Segment offsets refer to the
stable extracted text, never a page or DOM position, so they survive
pagination changes and can reuse `PaginatedReader.jumpToParaIdx`.

Reference: Calibre shows a small action bar after a text selection, then lists
highlights in a separate panel grouped by book. ParallelTexts will use that
interaction without notes, colors, tags, or export in the first release.

## Scope and decisions

- Save a non-empty contiguous selection within one text stream. A book stream
  can cross paragraphs. An alignment stream can cross consecutive sentences on
  one source or target side, but never cross between sides.
- Support a normal book and an alignment, in both popover and side-by-side
  views.
- Keep highlights only in IndexedDB. They stay private and local, like books
  and alignments.
- Associate each item with exactly one book or one alignment.
- For an alignment item, record whether the selection came from its `source`
  or `target` text. A book item has no side.
- Put the collection on its own route. The reader gets a compact entry point.
- List the saved quote, its title, and a short location label. Clicking it
  opens the owner and jumps to its paragraph.
- Allow individual deletion from the collection. No bulk delete in the first
  release.
- Start with page sizes of 25. Use the existing shadcn-style pagination
  component only if the project already has one or its primitives fit cleanly.

## Implementation checklist

### Step 1 - prototype the reader selection interaction with stand-in data

- [x] Implement a temporary client-only selection controller in the book reader
  and both alignment views. When the user selects non-empty text in one stream,
  collect every intersected paragraph or sentence segment and show a small
  anchored action with a
  bookmark-style icon and the label "Save highlight".
- [x] Make the action add a temporary `segments[]` item to component state.
  Render every captured range with a subtle highlight, then clear the browser
  selection.
- [x] Accept a book selection across paragraphs and an alignment selection
  across consecutive sentences on one side. Reject whitespace-only selections,
  reader controls, source-to-target selections, and selections that disappear
  before the action is pressed.
- [x] Do not add Dexie tables, route changes, or persistent state in this step.

- [x] **Verify:**
  - Open one book and one alignment in each reader mode.
  - Select a few words inside a paragraph. Confirm the action appears beside
    the selection and the text becomes visibly highlighted after saving.
  - Select across two book paragraphs and across two source-side alignment
    sentences. Confirm one action saves and highlights every selected portion.
  - Select across source and target sides, then select only spaces. Confirm no
    save action appears.
  - Turn a page and return. Confirm the temporary highlight remains for that
    mounted reader session.

- [x] **Confirm understanding:** explain why one selection uses several
  stable-text segments rather than one page range, and why source-to-target
  selections are rejected.

### Step 2 - confirm the selection UX before persistence work

- [x] Do not implement anything in this step. Review the Step 1 prototype on a
  mouse and a touch-capable device if one is available.
- [x] Decide whether the save action should stay next to the selected text or
  move to a fixed reader control. Keep the interaction that is less likely to
  cover the selected text or interfere with page navigation.
- [x] Confirm that the selected text remains readable after saving and that a
  saved range is visually distinct from an active browser text selection.

- [x] **Verify:**
  - Proceed only when the save action is easy to find in a book and both
    alignment views.
  - If the action overlaps text, closes too easily, or conflicts with touch
    selection, revise Step 1 before continuing.
  - Record the approved interaction in this document before building the
    database layer.

- [x] **Confirm understanding:** state which reader interaction was approved
  and what information it must supply when a user saves a selection.

### Step 3 - add the saved-selection data model and database migration

- [x] Add `src/types/saved-selection.ts` with a `SavedSelection` type. Include
  an ID, `ownerType` (`"book"` or `"alignment"`), `ownerId`, `segments`, a
  selected-text snapshot, and `createdAt`.
- [x] Define discriminated segment types. A book segment has `paraIdx`,
  `startOffset`, and `endOffset`. An alignment segment also has `side`
  (`"source" | "target"`) and `pairIdx`. Do not infer these values from the
  text, current view, or swapped-reader state.
- [x] Add a new Dexie schema version in `src/lib/db.ts` with a
  `savedSelections` table. Index the owner fields needed to retrieve one
  reader's items without loading the entire collection.
- [x] Leave existing tables and their records unchanged. Dexie must upgrade an
  existing local database without deleting books, alignments, or exclusions.

- [x] **Verify:**
  - Add a focused test or a temporary browser-console check that creates one
    book selection and source and target selections for the same alignment.
  - Inspect the stored rows in IndexedDB. Confirm the two alignment rows share
    the same `ownerId` but have different `side` values.
  - Reload the app. Confirm all three rows remain and existing books and
    alignments still open.

- [x] **Confirm understanding:** explain why an alignment selection needs both
  an alignment ID and a side, rather than associating it directly with one of
  the alignment's books.

### Step 4 - add focused saved-selection store functions

- [x] Add `src/store/saved-selections.ts` with small Dexie wrappers:
  `createSavedSelection`, `getSavedSelectionsForOwner`, and
  `deleteSavedSelection`. Add `getSavedSelectionsPage` only for the collection
  route's ordered, filtered pagination.
- [x] Have `getSavedSelectionsForOwner` take an owner type and ID, order items
  newest first, and optionally accept a `side` filter for alignment readers.
- [x] Validate every segment before writing it: offsets are integers,
  `startOffset >= 0`, `endOffset > startOffset`, segments are ordered in one
  stream, and the saved-text snapshot is non-empty.
- [x] Keep the store ignorant of routing, rendering, selection APIs, and page
  numbers. It only reads and writes records.

- [x] **Verify:**
  - Add Vitest coverage for creating book, source-alignment, and
    target-alignment records.
  - Assert an owner query never returns records belonging to another book or
    alignment, and a source-side query excludes target-side records.
  - Delete one record and assert that only it disappears after a fresh query.
  - Run `pnpm vitest run src/store/saved-selections.test.ts` and `pnpm lint`.

- [x] **Confirm understanding:** explain why the store receives an owner ID and
  optional side filter instead of letting each reader scan every saved item.

### Step 5 - replace the book-reader stand-in with persisted selections

- [x] Extract the DOM-range-to-segments calculation used by Step 1 into a small
  reader helper. It must enumerate every intersected book paragraph and return
  offsets relative to each paragraph's original `text`.
- [x] In `src/routes/book.$id.tsx`, load that book's items, render saved ranges
  without changing the paragraph's source text, and replace the Step 1 stub
  with `createSavedSelection`.
- [x] On a failed write, keep the browser selection available and show a clear
  error. Do not leave an optimistic highlight in the reader.
- [x] When saved offsets no longer match the stored quote, hide that range
  rather than highlighting the wrong words. The collection can still show the
  saved snapshot and offer deletion.

- [x] **Verify:**
  - Save selections at the beginning, middle, and end of a paragraph.
  - Refresh, change font size, resize the viewport, and reopen the book.
    Confirm each selection remains on the same words.
  - Save two non-overlapping selections in one paragraph and confirm both
    render correctly.
  - Run a focused unit test for DOM-range offset conversion and a manual Dexie
    persistence check.

- [x] **Confirm understanding:** explain why offsets are relative to extracted
  paragraph text, not the current page or a browser DOM node path.

### Step 6 - prove book selection navigation end to end

- [x] Add a temporary, reader-local list of saved book selections using the
  real store data. Clicking an item calls `jumpToParaIdx` and gives the saved
  text a brief focus treatment after the page changes.
- [x] Ensure navigation works when the book opens from a saved selection rather
  than from the current reading location.
- [x] Keep this list temporary. It proves navigation before a collection route
  and its pagination add more UI at once.

- [x] **Verify:**
  - Save selections on at least three different pages, reload at page one, and
    activate each list item.
  - Confirm the reader lands on the right paragraph after viewport resizing.
  - Confirm the focus treatment clears without changing reading progress.

- [x] **Confirm understanding:** describe what makes paragraph navigation
  stable when pagination changes.

### Step 7 - persist selections in the side-by-side alignment reader

- [ ] Mark each selectable alignment sentence span with its canonical
  paragraph index, pair index, and source or target side. Offset calculation
  must be relative to the individual `AlignedPair` text, not the whole visual
  column.
- [ ] Map a visual selection back to canonical source or target coordinates
  before saving. When the user has swapped alignment direction, invert the
  visual side before it reaches the store.
- [ ] Load and render saved ranges on both columns. Keep source and target
  highlight styles identical apart from an accessible label that names the
  side.
- [ ] Accept selections spanning consecutive sentences on one side, but reject
  selections that cross source and target sides.

- [ ] **Verify:**
  - Save one source and one target selection in the same aligned pair, plus a
    source selection in another paragraph.
  - Swap the reader direction, refresh, and confirm all selections appear on
    their original canonical texts.
  - Try a selection spanning two sentences or both columns. Confirm no save
    action appears.

- [ ] **Confirm understanding:** explain why a pair index is required for an
  alignment even though it already has a paragraph index.

### Step 8 - add target selections and navigation to popover alignment view

- [ ] Reuse the source-side sentence selection behavior in the paginated
  popover reader.
- [ ] Make the target text in `PairPopoverContent` selectable and save it with
  the same canonical paragraph and pair coordinates as the triggering source
  sentence.
- [ ] For navigation, jump to the paragraph, open the saved pair's popover,
  then apply the short focus treatment to the selected source text or target
  text. Do not depend on a page number.
- [ ] Preserve the existing popover behavior for unmatched pairs. A side with
  empty text cannot create a saved selection.

- [ ] **Verify:**
  - Save and reopen source and target selections from a matched pair.
  - Save an item in side-by-side view and open it in popover view, then repeat
    in reverse.
  - Confirm unmatched and excluded empty-side pairs do not offer an invalid
    save action.

- [ ] **Confirm understanding:** explain how a target-side item can reopen its
  text even though that text initially lives inside a popover.

### Step 9 - build the saved selections collection route with stand-in data

- [ ] Add a `/saved-selections` route and a navigation entry. First render a
  hardcoded list with book and alignment examples, including source/target
  labels, quote snippets, creation dates, a delete affordance, and an empty
  state.
- [ ] Let users filter by all items, books, alignments, source text, or target
  text. Keep filters local to the route.
- [ ] Add paging only when the stand-in list exceeds 25 items. Use the
  project's existing shadcn-style primitives if present; otherwise add the
  smallest accessible next/previous page controls rather than a new dependency.
- [ ] Do not connect the list or delete button to IndexedDB in this step.

- [ ] **Verify:**
  - Review the empty state, a mixed list, and a 26-item list at mobile and
    desktop widths.
  - Confirm the quote remains the visual focus and the owner title and side
    label explain where it came from.
  - Confirm filters reset the list to page one and that page controls have
    clear disabled states.

- [ ] **Confirm understanding:** explain why collection UX is approved with
  stand-in items before its data query and deletion behavior are wired.

### Step 10 - connect the collection to IndexedDB and reader navigation

- [ ] Replace the stand-in collection data with `getSavedSelectionsPage`.
  Load owner titles in a batched lookup, not one IndexedDB read per row.
- [ ] On a collection click, route to `/book/$id` or `/alignment/$id` with a
  saved-selection ID in validated search params. Resolve the item in the
  destination reader, jump to its stored paragraph, and focus its exact range.
- [ ] Wire deletion to `deleteSavedSelection` after a confirmation dialog. On
  success, remove the row and return to the previous page if the last item on
  a page was deleted.
- [ ] If a book or alignment no longer exists, show the saved quote as an
  unavailable item with a delete option. Do not route to a missing owner.

- [ ] **Verify:**
  - Create more than 25 mixed selections, filter them, and delete the only
    item on a non-first page.
  - From the collection, open a book item, a side-by-side alignment item, and
    a popover target item. Confirm each lands at the correct words.
  - Delete a book or alignment outside this feature, then confirm its orphaned
    saved item is safe to view and delete.

- [ ] **Confirm understanding:** explain why a collection link contains a
  saved-selection ID instead of a computed page number.

### Step 11 - regression coverage and release checks

- [ ] Add tests for database upgrade, store filtering/deletion, offset
  validation, canonical side mapping after swap, and navigation parameter
  validation.
- [ ] Add a manual test script covering mouse selection, keyboard selection,
  touch long-press where available, all reader modes, reload, resize, and
  deleted owners.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- [ ] Check browser IndexedDB after upgrading from the current schema. Confirm
  books, alignments, exclusions, and saved selections all remain present.

- [ ] **Verify:**
  - Every automated command exits successfully.
  - A saved book item and source/target alignment items survive reload and
    reopen at the correct text in their relevant reader modes.
  - No selection UI appears for cross-paragraph, cross-sentence, empty, or
  - Do a comprehensive test using browser use, including regression tests using browser use
