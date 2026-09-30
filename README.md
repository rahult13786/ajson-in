# Jsonique — JSON / XML Payload Workbench

A 100% client-side React + Vite + TypeScript app for formatting, comparing, and
searching JSON and XML payloads. Nothing ever leaves the browser — there is no
backend, no API calls, no telemetry. All parsing, diffing, formatting, graph
rendering, and favorites storage happen locally (IndexedDB via Dexie for
favorites; everything else in memory / localStorage).

## Pages

The app uses a vertical sidebar (Formatter / Compare / Search) instead of top
tabs, with a dark/light theme toggle pinned at the bottom.

### Formatter (Inspector)

- Paste **JSON or XML** on the left — both are supported everywhere in the app.
- Dedicated **JSON sample** and **XML sample** buttons, plus file upload.
- **Format** / **Minify** behave differently per input kind:
  - JSON: Format rewrites the input itself (unchanged, original behavior);
    Minify only rewrites the result/download buffer, never the input.
  - XML: *neither* button touches the input — Format re-renders the
    structurally pretty-printed XML into the result buffer (preserving a
    leading `<?xml ...?>` declaration), and Minify renders the minified XML
    into the same result buffer. Both only affect what Copy/Download produce.
- Two result views: **Tree** and **Graph** (the old plain-text view and the
  "Path hierarchy" view have been removed).
  - For XML, Tree renders actual `<tag>`/`</tag>` markup with attributes and
    expand/collapse per element — not a JSON-ified version of the document.
  - Graph view is an entity-relationship-style diagram (top-down, zoomable,
    per-entity copy / copy-subtree, **Export PNG**); its root box is labeled
    with the real root tag for XML (not a generic placeholder).
- A horizontal **path bar** shows the live JSON/XML path of whatever was last
  clicked; clicking in the textarea and clicking in the tree/graph sync to
  each other (bidirectional).
- Icon-only Copy / Download buttons; a `[ ]` **Full Screen** button expands
  only the result pane.
- **Favorites** are stored in the browser's IndexedDB (via Dexie), not
  localStorage — clicking the star opens a **name prompt** before saving.
  Total favorites storage is capped at 2 MB; saving a payload that would push
  storage over the cap shows a confirmation listing exactly which older
  favorites (name + size) will be evicted, oldest first, before it proceeds.
  A **My favorites** button opens a browser to load, or delete, saved items.
- Left/right panes are resized by dragging the divider (persisted per browser).

### Compare

- Two resizable payload inputs (source / target), JSON or XML.
- A **draggable horizontal divider** between the inputs and the Differences
  panel lets the differences list be resized/scrolled independently of the
  inputs above it.
- **Download Summary** exports a `.txt` file, one line per difference, using:
  - `target is missing the json path at given path <path>`
  - `target has addition the json path at given path <path>`
  - `target has different value than Source the json path at given path <path>`
- **Previous** / **Next** step through every identified difference and
  scroll/highlight the corresponding row.
- A `[ ]` **Full Screen** button expands only the differences panel.
- "Show full path" has been permanently removed from this page.

### Search

- Paste JSON or XML on the left; results sit to the **right** (not below),
  with a draggable vertical divider between them.
- One search box queries both keys and values at once, producing two result
  columns: **Matches in keys** and **Matches in values**.
- Each column has its own secondary filter, and — per the documented
  example — the two work in opposite directions:
  - **Matches in keys** sub-filter narrows by the matched entry's **value**
    (the key still has to match the main query).
  - **Matches in values** sub-filter narrows by the matched entry's **key**
    (the value still has to match the main query).
- **Click** a result to jump the textarea to it and select the full row (not
  just the matched token).
- **Press and hold** a result to copy its full path to the clipboard.

## Architecture notes

- `payloadParser.ts` is the single entry point for parsing — it auto-detects
  JSON vs. XML and returns a unified `PosNode` position tree either way
  (plus a `rootLabel`: the real root tag for XML, `"root"` for JSON), so
  every other feature works identically regardless of input format.
- `jsonPositions.ts` / `xmlPositions.ts` are hand-rolled recursive-descent
  parsers with character-offset tracking (no `DOMParser` dependency), which
  is what makes textarea ↔ tree/graph click-sync possible. `xmlPositions.ts`
  preserves a leading `<?xml ...?>` declaration through pretty-printing.
- `XmlTree.tsx` renders XML documents as real tag markup (directly off the
  `PosNode` tree) with per-element collapse/expand, separate from
  `JsonTree.tsx` which renders the JSON-object view for JSON input.
- `favoritesDb.ts` is a small Dexie/IndexedDB wrapper: `planEviction()`
  figures out the oldest-first set of favorites to remove to stay under the
  2 MB cap, and `FavoritesModal.tsx` is the save-with-name-prompt /
  confirm-eviction / browse-and-load UI built on top of it.
- `compareUtils.ts` walks two parsed trees in lockstep (sorted keys for
  objects, index for arrays) to build the diff rows and the flat list of
  differences used by Download Summary and Next/Previous.
- `ResizableSplit.tsx` and `exportPng.ts` are dependency-free (no drag or
  screenshot libraries) — pointer events and an SVG `foreignObject` → canvas
  pipeline, respectively. The PNG export takes the graph's own unscaled
  width/height explicitly rather than measuring the live (possibly
  CSS-zoomed) DOM node, which was the cause of an earlier silent export
  failure.
- No network calls anywhere in the codebase.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check (tsc -b) + production build
```

This app has been verified with a real headless-Chromium pass (Playwright)
covering: sidebar labels/removal, view-mode buttons, Graph View PNG export
actually downloading, XML Format/Minify leaving the input untouched while
preserving the `<?xml ...?>` declaration, the XML tree rendering real tags,
the XML graph's root label, the Dexie favorites save/browse/evict flow, the
Compare page's added vertical divider, and the Search page's row layout and
corrected sub-filter semantics — not just `tsc -b`/`vite build` passing.
