# Saved highlights manual test

Run these checks in a Chromium browser with IndexedDB enabled.

1. In a book reader, save text with mouse drag and Shift plus arrow keys. Reload,
   resize the reader, and reopen the book. The same words remain highlighted.
2. In an alignment, save source and target ranges in both Side-by-side and
   Popover views. Swap direction, reload, and confirm each stays on its
   canonical source or target text.
3. Try whitespace-only and cross-column selections. No Save highlight action
   should appear.
4. Open an alignment's Details drawer and its Highlights tab. Confirm it lists
   only that alignment's items in reading order. Cancel a deletion and confirm
   the item remains. Confirm deletion only after the second click.
5. Open a book or alignment highlight from its reader-local list. The reader
   must jump to the saved range. A Popover target item also opens its pair
   popover.
