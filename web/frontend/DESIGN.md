# RedactFunnel UI redesign

The design spec for `web/frontend`: what the UI should look like, what must not change, and the order to build it in.
Cross-team behaviour is defined in `docs/` at the repo root. If this file and `docs/` disagree, `docs/` wins.

**Status:** phases 1–5 done. Video (phase 6) and Settings (phase 7) are not started. Baseline before this work: 19 test files, 174 tests passing.

## 1. Direction

**A precise review tool, not a marketing dashboard.** Users come here to check that faces and plates are hidden, so
the photo is the most important thing on screen and the interface stays out of its way.

| Principle                  | In practice                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Media first                | The stage takes the most space and has a neutral dark surround in both themes.                    |
| One accent, used rarely    | Cobalt marks the primary action, current nav item and focus. Everything else is neutral.          |
| Colour always means status | Green, amber and red appear only for status, and always with text, an icon or a line style.       |
| Flat and quiet             | Borders separate surfaces. No gradients, no sparkles, no lift on hover. Shadows only on overlays. |
| Self-contained             | Fonts and icons ship in the bundle. A privacy product makes no requests to font CDNs.             |

## 2. Guardrails

This redesign changes appearance and layout. It does not change what the app does.

### Do not modify

`api.ts`, `auth.ts`, `sync.ts`, `types.ts`, `hooks/*` (existing hooks), `context/AuthContext.tsx`,
`utils/format.ts`, `components/file-selection.ts`, anything in `web/backend`.

The upload limit work (2026-11-07) changed `api.ts`, `file-selection.ts` and the backend's defaults on purpose: the
frontend has no batch limit of its own, and the backend's 409 `BATCH_FULL` response is the source of it.

### Behaviour to preserve

| Area           | Must stay true                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stage geometry | `.comparison` keeps a **definite height**, because `ImageStage` reads its parent's `clientHeight` to choose a fit mode. `.image-stage` gets no padding or border, or the boxes drift off target.                   |
| Image layers   | `.image-stage img` stays `width/height: 100%` with `object-fit: fill`. `.comparison-before` and `.comparison-after` stay `position: absolute; inset: 0`. The `clipPath` and `boxToPercent` maths stay as they are. |
| Preview canvas | `drawRedaction`, `SAMPLE_BOXES` and the 640×400 canvas stay. Its `#111827` blackout is pixel data, not UI, so it is not themed.                                                                                    |
| Review order   | `sortBatchJobs` keeps failed jobs first, then review candidates by lowest confidence.                                                                                                                              |
| Action gating  | Every `disabled` condition stays: delete while active, rerun on a draft, download with no completed results, submit with no targets.                                                                               |
| Bad references | `WHITELIST_REFERENCE_ERROR` shows the rerun banner and **no** Retry button. The batch fails; it never skips and continues.                                                                                         |
| Notices        | Success toasts hide after 3 s and don't block clicks. Error toasts stay until dismissed. The sync pill shows only during an outage and briefly on recovery.                                                        |
| Dialogs        | Dialogs sit above toasts and the sync pill, and keep the scroll lock and focus handling in `ui/Dialog.tsx`.                                                                                                        |
| Saved lists    | Saved face lists are allow lists only. No block-list UI.                                                                                                                                                           |

### What the tests rely on

New tests follow the existing rule: query by role and loose intent, assert outcomes, never classes or exact copy.
These existing hooks must survive, or the tests that use them need updating in the same commit:

| Hook                                                                                                                                 | Used by                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `.toast`, `.thumbnail-placeholder`, `.face-viewer-label`                                                                             | `app-routing`, `whitelist-report`, `face-lists`               |
| Hidden `input[type=file]` elements                                                                                                   | `dropzone`, `whitelist-previews`, `face-lists`, `batch-rerun` |
| Accessible names `Before / after`, `Show boxes`, `Choose images to redact`                                                           | `result-viewer-ux`, `batch-rerun`                             |
| Box labels rendered as text (`#1`, `#2`)                                                                                             | `result-viewer-ux`                                            |
| `Live sync · 3s` and `Live sync · 5s` text                                                                                           | `error-notices`                                               |
| **Exactly one** heading matching the batch name, and one matching `/run/i` on the rerun page, so keep the batch name out of the `h1` | `app-routing`                                                 |
| **Exactly one** `h1` on `/`, one link matching `/library/i` in the nav                                                               | `app-routing`, `error-notices`                                |

## 3. What is wrong today

Measured from the current code.

| Problem                                                                                                                                                                        | Fix in  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| **`/login` and `/register` render the sidebar and "Your privacy workspace" topbar.** One shell wraps every route in `App.tsx`.                                                 | §6      |
| The stage is a **fixed 340 px tall** (250 px on phones), even on a 1440p display. It is the smallest thing on the review page.                                                 | §8.1    |
| The before/after slider sits below the image, away from what it controls.                                                                                                      | §8.1    |
| 129 lines of `styles.css` contain raw hex colours, so dark mode can't work without tokens.                                                                                     | §4, §5  |
| **Muted text fails WCAG AA:** `#75839a` on white is 3.84:1, and `#8b98ae` on the page background is 2.72:1.                                                                    | §4.1    |
| The flagged-box border `#e8c98a` is pale and fades into bright photos. Box types differ only by colour.                                                                        | §7.3    |
| 20 font sizes below 1rem, going down to 0.55rem (8.8 px).                                                                                                                      | §4.3    |
| Emoji and text glyphs act as icons (`🗂 🖼 👤 ⌂ ▦ ✦ ✎ ×`), and screen readers read them as part of link names.                                                                   | §7.1    |
| `outline: none` on `.text-input`, `.detection-row` and `.review-report-item`. Links and `summary` have no focus style.                                                         | §10     |
| Library repeats itself: `h1` "Media library", kicker "MEDIA LIBRARY", `h2` "Media library", plus the same sentence twice.                                                      | §8.3    |
| Batch pages are titled "Your privacy workspace".                                                                                                                               | §6      |
| `.workspace` uses `margin: auto`, which vertically centres short pages. The sidebar scrolls away on long ones.                                                                 | §6      |
| Report metrics use 5 columns for 7 tiles, and Library uses 4 for 3, leaving uneven gaps.                                                                                       | §7.2    |
| The `DRAFT` badge has no style. `PARTIAL` looks identical to `FAILED`.                                                                                                         | §7.2    |
| Dead CSS: `.avatar`, `.ttl-note`, `.warning-text`, and `.review-pill` defined twice. Classes with no CSS at all: `.rerun-source-info`, `.folder-selection`, `.section-header`. | Phase 3 |

## 4. Tokens

Tokens go in a new `src/tokens.css`, imported before `styles.css` in `main.tsx`. Components only use semantic tokens.
Raw hex is allowed in `tokens.css` and nowhere else.

### 4.1 Colour

| Token             | Light       | Dark        | Use                                                 |
| ----------------- | ----------- | ----------- | --------------------------------------------------- |
| `--bg`            | `#F4F5F7`   | `#0E1014`   | Page background                                     |
| `--surface`       | `#FFFFFF`   | `#16191F`   | Sidebar, panels, cards, dialogs, inputs             |
| `--surface-2`     | `#EEF0F3`   | `#1E222A`   | Sunken areas, metric tiles, resting rows            |
| `--surface-hover` | `#E4E7EC`   | `#272C35`   | Hover on rows and ghost buttons                     |
| `--border`        | `#D9DDE3`   | `#2D333D`   | Dividers, panel edges (decorative)                  |
| `--border-strong` | `#858E9C`   | `#6F7887`   | Input, checkbox and secondary button edges          |
| `--text`          | `#14181F`   | `#E8EAED`   | Primary text                                        |
| `--text-2`        | `#454E5C`   | `#B2B9C4`   | Labels, secondary text                              |
| `--text-3`        | `#5A6472`   | `#969EAB`   | Metadata, helper text (the lowest allowed)          |
| `--accent`        | `#2B57D0`   | `#3F6FE8`   | Primary fill, focus ring, range and checkbox accent |
| `--accent-hover`  | `#2349B3`   | `#5580EE`   | Primary hover                                       |
| `--on-accent`     | `#FFFFFF`   | `#FFFFFF`   | Text on `--accent`                                  |
| `--accent-text`   | `#2A52C4`   | `#92B2FF`   | Links, active nav text                              |
| `--accent-soft`   | `#E7EDFB`   | `#1B2947`   | Active nav and selected row background              |
| `--ok`            | `#17693F`   | `#6FD69B`   | Success text and icons                              |
| `--ok-soft`       | `#E4F4EA`   | `#12291D`   | Success background                                  |
| `--warn`          | `#7A4F00`   | `#F2C265`   | Review text and icons                               |
| `--warn-soft`     | `#FFF4DC`   | `#2B2110`   | Review background                                   |
| `--danger`        | `#B3261E`   | `#FF9C94`   | Errors, destructive text                            |
| `--danger-soft`   | `#FCEBEA`   | `#331615`   | Error background                                    |
| `--scrim`         | `#10182B80` | `#000000A6` | Dialog backdrop                                     |

Dark mode is a separate palette, not an inversion. Semantic colours get lighter and less saturated.

**Computed contrast (WCAG 2.1).** Every pair meets AA, which is 4.5:1 for text and 3:1 for control edges.

| Pair                              | Light | Dark  |
| --------------------------------- | ----- | ----- |
| `--text` / `--surface`            | 17.79 | 14.61 |
| `--text-2` / `--surface-2`        | 7.37  | 8.07  |
| `--text-3` / `--bg`               | 5.50  | 7.05  |
| `--text-3` / `--surface-hover`    | 4.84  | 5.19  |
| `--on-accent` / `--accent`        | 6.22  | 4.52  |
| `--accent-text` / `--accent-soft` | 5.77  | 6.90  |
| `--ok` / `--ok-soft`              | 5.89  | 8.65  |
| `--warn` / `--warn-soft`          | 6.53  | 9.55  |
| `--danger` / `--danger-soft`      | 5.67  | 8.24  |
| `--border-strong` / `--bg`        | 3.03  | 4.27  |

Dark `--on-accent` / `--accent` has almost no margin at 4.52. Any change to that accent needs a re-check.

### 4.2 Media tokens (the same in both themes)

These sit on or around photos, so they must not change with the theme. A neutral surround also stops the theme
tinting how a viewer judges a redaction.

| Token            | Value       | Use                                                    |
| ---------------- | ----------- | ------------------------------------------------------ |
| `--stage-bg`     | `#15171B`   | Letterbox behind images and video                      |
| `--stage-text`   | `#E8EAED`   | Empty and failed states on the stage (14.89:1)         |
| `--box-redacted` | `#5B9BFF`   | Redacted detection                                     |
| `--box-kept`     | `#2BD27F`   | Allow-listed detection                                 |
| `--box-review`   | `#FFB020`   | Flagged detection                                      |
| `--box-ink`      | `#0B0D10`   | Label text on the three box colours (7.02:1 or better) |
| `--box-halo`     | `#000000A6` | 1 px outline around every box                          |
| `--chip-bg`      | `#000000B3` | "Original" and "Redacted" chips                        |

The halo is required. Box colours alone reach only 1.83 to 2.77:1 against white, but at least 7.58:1 against black.
Together they stay visible on any photo.

### 4.3 Type

Keep **Inter Variable** (already bundled through `@fontsource-variable/inter`) and the existing system mono stack, so
no new font dependency. Use mono for batch IDs and error codes, and `font-variant-numeric: tabular-nums` for
percentages, counts and progress so values don't jitter while polling.

| Token         | Size / line height | Weight  | Use                                     |
| ------------- | ------------------ | ------- | --------------------------------------- |
| `--text-xs`   | 12 / 16            | 400–500 | Metadata, badges, helper text (minimum) |
| `--text-sm`   | 13 / 18            | 400–500 | Rows, labels, table-like content        |
| `--text-base` | 14 / 20            | 400     | Body and controls                       |
| `--text-lg`   | 16 / 24            | 600     | Panel titles, `h3`                      |
| `--text-xl`   | 20 / 28            | 600     | Batch name, `h2`                        |
| `--text-2xl`  | 24 / 32            | 600     | Page title, `h1`                        |
| `--text-num`  | 24 / 32            | 600     | Stat tile values                        |

- The only text under 12 px is the 11 px box and thumbnail number labels, which are short and sit on solid fills.
- Below 680 px, inputs use 16 px so iOS doesn't zoom on focus.
- Replace the negative tracking (`-0.055em`) with `-0.01em` on `h1` and `h2`, and none elsewhere.
- Use uppercase kickers only where they add information. Remove the ones that repeat a heading.

### 4.4 Space, shape, depth, motion

| Group     | Values                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Spacing   | `--space-1` to `--space-7`: 4, 8, 12, 16, 24, 32, 48 px                                                                        |
| Radius    | `--radius-sm` 4 (badges, thumbs), `--radius-md` 6 (buttons, inputs, rows), `--radius-lg` 10 (panels, stage, dialogs)           |
| Elevation | Panels get a border and no shadow. `--shadow-overlay` is only for toasts, dialogs and the sync pill.                           |
| Motion    | `--ease-out: cubic-bezier(0.2, 0, 0, 1)`. `--dur-fast` 120 ms for hover and focus, `--dur-base` 160 ms for toasts and dialogs. |
| Z-index   | `--z-stage` 3, `--z-toast` 4, `--z-dialog` 5, matching the current order                                                       |

Animate colour, opacity and transform only. Remove `translateY` on hover. Extend the existing reduced-motion block to
all transitions.

### 4.5 Migrating the old variables

Replace these everywhere, then delete them. Raw hex values map to the nearest token by role.

| Old                                         | New                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `--navy` as text                            | `--text`                                                                |
| `--navy` as a background                    | `--surface` (sidebar), `--text` with `--surface` text (thumbnail badge) |
| `--muted`, `#8794a8`, `#8b98ae` etc.        | `--text-3`, or `--text-2` for labels                                    |
| `--line`, `#dbe2ed`, `#d7dfeb` etc.         | `--border`, or `--border-strong` on controls                            |
| `--violet`, `--cyan`, all gradients         | `--accent`, solid                                                       |
| `--soft`, `#f8f9fc`, `#fbfcff`              | `--surface-2`                                                           |
| `--success`, `--danger`                     | `--ok`, `--danger`                                                      |
| `--warn-text`, `--warn-bg`, `--warn-border` | `--warn`, `--warn-soft`, and `--warn` for the border                    |

## 5. Dark and light mode

- `<html data-theme="light|dark">` is always set, so `tokens.css` needs a single `:root` block plus a single
  `[data-theme="dark"]` block. Each also sets `color-scheme`, which themes scrollbars and native selects.
- **First visit follows the OS.** Once the user picks, the choice is saved and wins. Two states are enough: there is
  no separate "System" option to explain.
- A small inline script in `index.html` runs before first paint, so a dark-mode user never sees a white flash. The app
  sends no CSP today, so the inline script isn't blocked. If a CSP is added later, it needs a hash for this script.

```html
<script>
  (function () {
    var saved = null;
    try {
      saved = localStorage.getItem("theme");
    } catch (e) {}
    var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  })();
</script>
```

**New `hooks/useTheme.ts`** returns `{ theme, toggleTheme }`. It reads the initial value from `dataset.theme`, writes
the dataset and `localStorage` on toggle, and follows OS changes until the user has picked. Plain state is enough
because only one toggle is ever mounted.

> **Trap:** jsdom has no `matchMedia`, and most DOM tests mount `<App />`. Call `window.matchMedia?.(...)` and wrap
> `localStorage` in try/catch, or the whole suite fails at render.

**New `components/ui/ThemeToggle.tsx`** is an icon button showing the theme you would switch to, with
`aria-label="Switch to dark mode"` or `"Switch to light mode"`. It lives in the sidebar footer and the top-right of
the auth screen.

## 6. App shell and the login fix

Split the one shell in `App.tsx` into two layout routes. Each layout does the auth check for its routes, so the five
`ProtectedRoute` wrappers go away.

```tsx
function AuthenticatedApp() {
  // status, message, setMessage and the toast timer stay exactly as they are today.
  if (status === "loading") return <SessionSplash />;

  return (
    <Routes>
      {/* Logged-in users are sent to "/". No sidebar, no topbar. */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Logged-out users are sent to "/login". Owns Sidebar, Topbar, toast and SyncStatus. */}
      <Route element={<WorkspaceLayout message={message} onDismiss={() => setMessageState(null)} />}>
        <Route path="/" element={<DashboardPage onMessage={setMessage} />} />
        <Route path="/library" element={<LibraryPage onMessage={setMessage} />} />
        <Route path="/batches/new" element={<CreateBatchPage onMessage={setMessage} />} />
        <Route path="/batches/:id/rerun" element={<RerunBatchPage onMessage={setMessage} />} />
        <Route path="/batches/:id" element={<BatchPage onMessage={setMessage} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

Consequences of this change:

- A logged-in user on `/login` is redirected to `/`. Today they get a sign-in form; without the sidebar it would be a
  dead end.
- A logged-out user on an unknown URL goes to `/login`, not a 404 inside the app shell.
- `SessionSplash` is a centred "Checking session…" on `--bg`, so loading never flashes the shell.

**Testing:** `AuthProvider` is always authenticated in test mode, so mock `useAuth` for this. Assert that logged out,
`/login` shows the form and no `navigation` landmark, and that logged out, `/` ends up on the sign-in form.

### Auth screen

```
┌───────────────────────────────────────────────────┐
│                                              [☾]  │
│                                                   │
│                  ▮ RedactFunnel                   │
│                                                   │
│              ┌───────────────────┐                │
│              │ Sign in           │  h1            │
│              │ Email    [______] │                │
│              │ Password [______] │                │
│              │ [     Sign in   ] │                │
│              │ Need an account?  │                │
│              └───────────────────┘                │
└───────────────────────────────────────────────────┘
```

- `.auth-shell` is a full-height (`100dvh`), centred column on `--bg`.
- `.auth-card` is 400 px wide, on `--surface` with a border and no shadow. The brand sits above it.
- Change `h2` to `h1` on both auth pages, since there is no topbar now. Remove the "Secure access" kicker.
- Keep `autoComplete`, native `required` and paste working, for password managers.

### Sidebar

- 224 px, `--surface` with a right border, in both themes. `position: sticky; top: 0; height: 100dvh`.
- Top: brand. Replace the gradient `✦` with a flat mark: a solid rounded bar with a clean horizontal cut, in `--accent`.
- Middle: nav with icon + label, using the `aria-current` that `NavLink` already sets. Active item: `--accent-soft`
  background and `--accent-text`. Remove the `.nav-item:first-letter` hack.
- Footer: user email (truncated, full value in `title`), theme toggle, Sign out as a ghost button, separated by a
  divider so it sits apart from navigation.
- **On the review page it collapses to a 64 px icon rail** above 680 px, via `.app-shell:has(.details-card) .sidebar`,
  so no JS is needed. Labels stay in the DOM but are visually hidden, so links keep their accessible names, and each
  gets a `title`. At 1440 px this is what lets the stage reach 784 px wide.
- Below 680 px it becomes a top bar: brand, theme toggle and Sign out on one row, then nav as equal columns with the
  icon above a 12 px label, so nothing wraps or scrolls sideways. The email moves to the Sign out button's `title`.

### Topbar

Slim and text-only: `h1` at `--text-2xl`, an optional one-line subtitle, and the `Live sync` indicator on the right.
Move the user controls to the sidebar footer. On batch pages the `h1` becomes "Batch review" with no subtitle, because
the batch name is the page's real heading (and must not be in the `h1`, see §2).

Also: `.workspace` uses `margin-inline: auto`, gets `min-width: 0`, and goes full width on the review page with
`.workspace:has(.details-card) { max-width: none; }`, so no route-based JS is needed. Set the document `<title>` to
"RedactFunnel" instead of "Image Processing Service".

## 7. Components

Restyle the existing classes and extend the existing components. New CSS must be generic classes, not one-offs.

### 7.1 Icons

Add **`@phosphor-icons/react`** as the only new dependency, regular weight, `1em`-based sizing, `aria-hidden` beside
visible text. Icon-only buttons keep their existing `aria-label`. Delete `ui/TrashIcon.tsx` once its imports move.

| Today                  | Icon                            | Today               | Icon           |
| ---------------------- | ------------------------------- | ------------------- | -------------- |
| `⌂` Overview           | `SquaresFour`                   | `↑` dropzone        | `UploadSimple` |
| `🗂` Library            | `Images`                        | `×` remove, dismiss | `X`            |
| `＋` New batch         | `Plus`                          | `✎` rename          | `PencilSimple` |
| `▦` Batch details      | `Stack`                         | `▾` expand          | `CaretDown`    |
| `🖼` No thumbnail       | `Image`                         | Trash               | `Trash`        |
| `👤` Empty allow lists | `UserList`                      | `→` in buttons      | Remove         |
| `✦` Empty states       | `Images` or `Stack`, by context | Theme toggle        | `Sun` / `Moon` |

### 7.2 Controls and feedback

| Component                        | Spec                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.primary-button`                | Solid `--accent`, 36 px tall, weight 600. **One per view.** Library cards drop to secondary so a grid of 20 doesn't show 20 primaries.                                       |
| `.secondary-button`              | `--surface`, `--border-strong` edge, `--text`. Hover: `--surface-hover`.                                                                                                     |
| `.danger-button`                 | `--surface`, `--danger` text and edge. Hover: `--danger-soft`. Placed apart from other actions.                                                                              |
| `.icon-button` and friends       | `.pencil-button` and `.delete-item-button` share one 32 px square. 44 px under `@media (pointer: coarse)`. `.delete-item-button` loses its 0.7 opacity so it stays readable. |
| Inputs and selects               | Unify `.auth-form input`, `.text-input`, `select` and `input[type=number]`: 36 px, `--surface`, `--border-strong`. Error state uses `--danger` plus the existing message.    |
| Disabled                         | Opacity 0.5, `not-allowed`, native `disabled`. Same rule for links styled as buttons.                                                                                        |
| `.stats-grid`, `.report-metrics` | `repeat(auto-fit, minmax(140px, 1fr))`, so 3, 4 or 7 tiles all fill the row. Tiles are `--surface-2` with no border; values use `--text-num` with tabular numbers.           |
| Banners                          | Soft background, semantic text, and a matching icon so colour isn't the only signal. The toast and sync pill reuse them with `--shadow-overlay`.                             |
| `.dialog`                        | `--surface`, `--radius-lg`, `--scrim`. Keep the backdrop blur, since it signals dismissal.                                                                                   |
| `.dropzone`                      | Dashed `--border-strong` on `--surface-2`. Drag state: solid `--accent` edge and `--accent-soft`. Flat icon, no gradient tile.                                               |
| `.scroll-list`                   | Keep the behaviour. Thin scrollbar via `scrollbar-color`, themed by `color-scheme`.                                                                                          |

Remove the remaining inline `style` props (`DetectionList`, `RedactionConfigForm`, `SavedFaceListsPanel`,
`WhitelistUploader`) in favour of classes. The `ImageResultViewer` ones are computed geometry and stay.

**Status map.** Every status shows text and has its own colour. Displayed sentence case comes from CSS
(`text-transform: lowercase` with an uppercase `::first-letter` on an inline-block), so the DOM text and tests stay
the same.

| Status              | Badge colours                    | Dot                                               |
| ------------------- | -------------------------------- | ------------------------------------------------- |
| `DRAFT`             | `--surface-2`, `--text-2`        | `--text-3`, hollow                                |
| `PENDING`, `QUEUED` | `--surface-2`, `--text-2`        | `--text-3`                                        |
| `PROCESSING`        | `--accent-soft`, `--accent-text` | `--accent`, slow pulse (off under reduced motion) |
| `COMPLETED`         | `--ok-soft`, `--ok`              | `--ok`                                            |
| `PARTIAL`           | `--warn-soft`, `--warn`          | `--warn`                                          |
| `FAILED`            | `--danger-soft`, `--danger`      | `--danger`                                        |
| Needs review (pill) | `--warn-soft`, `--warn`          | n/a                                               |

### 7.3 Detection overlay

Boxes use the media tokens and differ by **line style as well as colour**, so they work for colour-blind viewers and
on any photo. Every box gets `box-shadow: 0 0 0 1px var(--box-halo), inset 0 0 0 1px var(--box-halo)`.

| Class                        | Colour           | Line   | Meaning            |
| ---------------------------- | ---------------- | ------ | ------------------ |
| `.detection-box-redacted`    | `--box-redacted` | Solid  | Hidden             |
| `.detection-box-whitelisted` | `--box-kept`     | Dotted | Kept, allow-listed |
| `.detection-box-warning`     | `--box-review`   | Dashed | Needs review       |

Label: 11 px, weight 700, `--box-ink` on the box colour. `.is-highlighted` goes to 3 px with a 3 px ring of the same
colour at reduced opacity. While `showBoxes` is on, show a small legend in `.viewer-controls` using the same line
styles. Render it only in that state, so the words don't appear in the page by default. Each swatch sits on a small
`--stage-bg` chip, because the box colours are too light to read directly on a light-theme surface.

## 8. Pages

### 8.1 Batch review (the core screen)

Drop the outer `.details-card` border and padding (keep the class, it's the `:has()` hook, so **only this page may use
it**) and give the stage the room.

```
≥ 1360 px (sidebar collapsed to the 64 px rail)
┌──────────────────────────────────────────────────────────────────────────────┐
│ Alpha Production Run ✎   [Processing]  12/40 complete ▓▓▓░░░     [Delete batch] │
├───────────┬───────────────────────────────────────────────────┬──────────────┤
│ 220 px    │ street-01.jpg              [Needs review] [Retry] │ 280 px       │
│           │ ┌───────────────────────────────────────────────┐ │              │
│ ● a.jpg   │ │ Original                │              Redacted│ │ #1 Face 92%  │
│ ● b.jpg   │ │                         │                      │ │    Redacted  │
│ ▌● c.jpg  │ │              stage      ◉      fills height    │ │ #2 Plate 41% │
│ ● d.jpg   │ │                         │                      │ │    Review    │
│           │ └───────────────────────────────────────────────┘ │ #3 Face 88%  │
│           │ [ ] Show boxes  ── redacted ·· kept -- review     │    Kept      │
│           │ Done · 100%     Open original   Download result   │              │
├───────────┴───────────────────────────────────────────────────┴──────────────┤
│ Batch report: metrics · review list · allow-listed people · downloads        │
└──────────────────────────────────────────────────────────────────────────────┘

980–1359 px: list + stage, with detections under the stage.
< 980 px:    one column. List capped at about 200 px, then stage, then detections.
```

**Three panes without moving logic.** `ImageResultViewer` already renders the head, stage, controls, meta and detection
list as direct children of `.result-viewer`, so CSS grid can do it. `hoveredIndex` stays where it is.

```css
.details-layout {
  --stage-h: clamp(360px, calc(100dvh - 300px), 860px);
  grid-template-columns: 220px minmax(0, 1fr);
}
.result-viewer {
  container-type: inline-size; /* Lets the stage height follow its own width. */
}
.comparison {
  /* Must stay definite: ImageStage measures it. The second value stops landscape photos getting big bars. */
  height: min(var(--stage-h), 66cqw);
  background: var(--stage-bg);
}
@media (min-width: 1360px) {
  .result-viewer {
    display: grid;
    column-gap: var(--space-5);
    grid-template-columns: minmax(0, 1fr) 280px;
  }
  .comparison {
    height: min(var(--stage-h), calc((100cqw - 304px) * 0.66)); /* 304 = detections pane + gap. */
  }
  .result-viewer > .detection-list,
  .result-viewer > .empty-inline {
    grid-column: 2;
    grid-row: 1 / span 5;
    max-height: calc(var(--stage-h) + 120px);
  }
}
@media (max-width: 980px) {
  .comparison {
    height: max(240px, min(56dvh, 72cqw));
  }
}
```

Mocking this up at 1440 × 1000 gave a 784 × 517 stage, with a 16:10 photo at 784 × 490. The trade-off is portrait photos:
they are limited by that height, so they show smaller. Above 980 px the image list fills the
height of the viewer column, and at 1360 px and up the detection list does too, so both side lists line up and scroll on
their own. Neither scrolls sideways.

**Opens on the redacted image.** `split` starts at 0 and `showBoxes` stays off, so opening an image never reveals
faces. At 0% the divider sits on the stage edge, where `.comparison` would clip half its handle, so add a class to the
divider when `split` is under 3 (and the mirror case over 97) that keeps the handle fully inside the stage.

**Slider on the image.** This is the only JSX change in the viewer. Move the existing `<input type="range">` inside
`ImageStage` with the same `split` state and `aria-label="Before / after"`, stretched transparently over the image.
Dragging anywhere moves the split, and the keyboard works natively.

```css
.comparison-range {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  appearance: none;
  cursor: ew-resize;
  touch-action: pan-y; /* A vertical swipe still scrolls the page. */
}
/* A wide native thumb would offset the value from the pointer. */
.comparison-range::-webkit-slider-thumb {
  appearance: none;
  width: 1px;
}
.comparison-range::-moz-range-thumb {
  width: 1px;
}
.image-stage:has(.comparison-range:focus-visible) .comparison-divider::after {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
```

- `.comparison-divider` gets a 32 px round handle (`::after`) on `--chip-bg` with a left-right glyph, and stays
  `pointer-events: none`. Boxes stay above at `--z-stage`.
- **Chips are CSS only**, so no new text enters the DOM: `.comparison-before::before { content: "Original" }` is cut by
  the same `clipPath`, so it disappears as the divider passes it. `.image-stage::after { content: "Redacted" }` sits
  top-right.

**Other changes here:**

- **Image and detection rows are flat** (decided 2026-11-07): no filled cards, just a hover tint. The selected image row
  keeps `--accent-soft` plus a 3 px `--accent` left edge via inset shadow, so it doesn't shift the layout.
- **One status line per image row,** such as "Done" or "Processing · 42%". A flagged row adds an inline amber "Needs
  review" with an icon, with no pill or amber fill. Long names are cut in the middle, because the end is what tells similar
  files apart, and the full name is in `title`. Delete appears on hover or focus, and always on touch screens.
- **Empty and failed states:** `.viewer-empty` in the stage position uses `--stage-bg` and `--stage-text` at the same
  height, so the layout doesn't jump when a result arrives. Error code in mono.
- **`.viewer-meta` links** become ghost buttons with a Download icon. `<a>` elements and attributes stay.
- **Header:** while the batch is processing, add a native `<progress>` fed by the `progress` value already computed.
  Batch ID in mono at `--text-xs`, and drop the "ACTIVE BATCH" kicker.
- **Report:** a full-width panel below the workspace. Keep the existing actions and their conditions. See below for
  its two lists.

**Report lists.** Metrics run across the top, with two equal columns under them. Everything already exists in
`BatchReport`, so this is layout, plus one small wrapper and heading on the left.

```
┌ Batch report ───────────────────────────────────────────────────────┐
│ [Faces] [Plates] [Redacted] [Allow-listed] [Low conf.] [Review ...] │
├─ Needs review ──────────────────┬─ Allow list people ───────────────┤
│ ⚠ 2 images need review          │ ▣ Alice    3 images, 5 detections ▾│
│ street-district1-12.jpg         │    street-district1-12.jpg        │
│   2 low-confidence detections   │    motorbikes-a4.webp             │
│ motorbikes-a4.webp              │ ▢ bao.jpg  0 images               │
├─────────────────────────────────┴───────────────────────────────────┤
│ [Download zip] [Download JSON report] [Rerun]                       │
└─────────────────────────────────────────────────────────────────────┘
```

- `.report-panel` becomes a two-column grid with `.report-metrics` on `grid-column: 1 / -1`. One column at 980 px and
  below. Drop the `border-top` on `.report-section`, since the columns already separate the lists.
- Wrap the review list (or its "No images need review" banner) in one column with an `h4` "Needs review", matching
  "Allow list people". Keep the `Review candidates` region name.
- **Needs review stays per image.** Clicking a row opens that image, and its detections show in the right pane. There
  is no separate per-detection list (decided 2026-11-06).
- **Deleted reference photos still show their file name.** `whitelist_names` outlives the files, so the card shows the
  grey placeholder with the name. Only batches created before that column existed fall back to "Allow list #n".
- **Keep the person cards as they are:** collapsed by default, expand on click, no toggle when a person has no images,
  and a placeholder when the reference photo is gone. Each list scrolls on its own via `.scroll-list`.
- **Selecting a row must bring the stage back into view.** The lists sit below it, so today's click would change the
  image off-screen. `BatchDetails` calls `setSelectedId`, then scrolls the review layout into view using
  `scrollIntoView?.()`, because jsdom doesn't implement it. Honour reduced motion.

### 8.2 Create and rerun batch

Two columns: what to process on the left, how to process it on the right.

```
┌────────────────────────────────────┬───────────────┐
│ Preview                            │ Credit line   │
│ Batch name                         │ Targets       │
│ ┌────────────────────────────────┐ │ Style         │
│ │ Dropzone                       │ │ Strength      │
│ └────────────────────────────────┘ │ Padding       │
│ Selected files                     │ Quality       │
│ Face allow list                    │ > Advanced    │
│                                    │ [ Create    ] │
└────────────────────────────────────┴───────────────┘
```

- **The preview stays at the top of the left column,** above the batch name (decided 2026-11-07). In the narrow right
  column it was too small to judge a style.
- The config column scrolls with the page. It isn't sticky and has no scroll box of its own.
- The preview panel uses `--surface`, so its frame follows the theme. The canvas pixels don't change.
- Style the currently bare `.rerun-source-info` and `.folder-selection` as helper text.
- `RerunBatchPage` reuses the same form and inherits all of this.

### 8.3 Overview and Library

**Overview.** `.welcome-card` becomes a flat row with the headline, one line of text and the primary button, with no
gradient. Keep the button and its `onCreate`. Stat tiles, then saved allow lists.

**Library.** Remove the `.welcome-card` copy, which only repeats the `h1`, and keep the Create link as a right-aligned
action row. Cards become media-first using CSS only:

```
┌────────────────────────┐
│   thumbnail 16:10   [🗑]│
├────────────────────────┤
│ Batch name ✎           │
│ [Completed]            │
│ 12/12 · 48 MB · 11/06  │
│ [Open] [Rerun] [Download]
└────────────────────────┘
```

- Scope the layout with `.library-card-header:has(> .library-thumbnail)`, because `SavedFaceListsPanel` and the picker
  in `WhitelistUploader` reuse `.library-card` with no thumbnail and must keep the row layout.
- Set `aspect-ratio: 16 / 10` on the thumbnail and add `loading="lazy"`, so 20+ cards don't shift while loading.
- Remove the lift on hover. Use `--border-strong` on hover instead.
- Empty states (`.empty-dashboard`): flat icon, one line, one action.

## 9. Video (Phase 2)

**Don't build this yet.** The frontend only accepts images today, and video is a separate task in `web/docs/plan.md`.
The `video-redact` contract in `docs/integration-contracts.md` §3 B2 is still marked proposed, awaiting Engine
confirmation. This section fixes the design so that work fits in without another redesign. The contract wins if it changes.

```
┌───────────────────────────────────────────┬───────────────┐
│ clip.mp4        [Original | Redacted]     │ Tracks        │
│ ┌───────────────────────────────────────┐ │ #1 Face 0:00  │
│ │        <video controls>               │ │ #3 Face 0:09  │
│ │        in the same .comparison stage  │ │  Possibly     │
│ └───────────────────────────────────────┘ │  unredacted   │
│ ░░██░░░░▒▒▒▒░░██░░░░  timeline            │ #4 Plate 0:21 │
│ 0:42 · 1920×1080                          │               │
└───────────────────────────────────────────┴───────────────┘
```

- **Same shell.** A `VideoResultViewer` uses the same `.result-viewer` grid, `.comparison` stage, `.viewer-head`,
  `.viewer-meta` and `.detection-row` rows, so the three-pane layout comes free. `BatchImageList` stays the left pane,
  with a small type icon for mixed batches.
- **One player with an Original / Redacted toggle**, which keeps `currentTime` when switching. The plan allows this or
  two synced players. This is simpler and has no sync drift. Always starts on Redacted, never autoplays.
- **Reserve the space** from `resultSummary.video` width and height, to avoid a layout jump, and use `preload="metadata"`.
- **Timeline** (`.media-timeline`, new and generic): a flat bar under the stage where the flagged ranges are real buttons.

| Range                 | Style                           | Meaning                                                                                               |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Track span            | `--surface-hover`               | Object is present                                                                                     |
| `lowConfidenceRanges` | `--box-review`, dashed top edge | Hidden, but worth checking                                                                            |
| `gapRanges`           | Red with diagonal hatching      | **May not be hidden.** The biggest risk in video, so it gets the strongest treatment and sorts first. |

- **Rows are the accessible path.** Clicking a track row or range seeks there, and keyboard users get the same through
  focusable rows. Ranges need a text alternative such as "Possibly unredacted, 0:15 to 0:16".
- Times use tabular numbers. Dropzone copy and `accept` change as part of that task, not this redesign.

## 10. Accessibility and responsive rules

**Focus.** One global rule replaces all the variants, including the `outline: none` cases in §3:

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Also required:**

- A "Skip to content" link as the first element in `WorkspaceLayout`, targeting `<main>`.
- One `h1` per page, with no skipped levels.
- Long filenames and IDs use `overflow-wrap: anywhere` with a `min-width: 0` parent. Truncated names keep the full value in `title`.
- Pointer targets are at least 24 px, and 44 px under `pointer: coarse`.

**Breakpoints.** Keep the existing 680 and 980 px, and add 1360 px for the three-pane layout. No horizontal page scroll
at 375 px.

**Known debt, out of scope:** `BatchImageList` rows are `role="button"` with a delete button nested inside. Fixing that
means restructuring the row, so it's a separate task.

## 11. Build order

Each phase ships alone and keeps the app working, at 1–3 commits per phase. Prettier, doc comments and the existing
test rules apply as usual. Run `npm run lint` and `npm run test:frontend` from `web/` after each one.

| #   | Phase                         | Scope                                                                                                          | Done when                                                                                                                           |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Shell and login fix**       | §6 layouts, routing, auth screen, page title. Existing styling is fine.                                        | No sidebar or topbar on `/login` or `/register`; redirects both ways; new auth tests pass.                                          |
| 2   | **Tokens and themes**         | §4 and §5. Move `styles.css` fully onto tokens, delete old variables.                                          | The only raw hex in `styles.css` is the `#fff` focus ring on the stage; both themes usable on every page; no white flash on reload. |
| 3   | **Components**                | §7: icons, buttons, inputs, status, type scale, dead CSS, overlay.                                             | No emoji icons; no text under 12 px except box and thumbnail labels; no `outline: none` without a replacement.                      |
| 4   | **Batch review**              | §8.1: three panes, stage height, slider on the image.                                                          | Boxes line up at all three widths for portrait and landscape images; slider works by mouse, touch and keyboard.                     |
| 5   | **Create, Overview, Library** | §8.2 and §8.3.                                                                                                 | No duplicate headings; preview beside the config; saved lists look unchanged in layout.                                             |
| 6   | **Video**                     | §9, inside the Phase 2 video task, once the contract is confirmed.                                             | Set by that task.                                                                                                                   |
| 7   | **Settings**                  | §13 for the UI, after the redesign phases. Items ship separately, in the priority order in `web/docs/plan.md`. | Set per item.                                                                                                                       |

**Manual check for every phase** (the tests can't see any of this): light and dark, at 375, 768, 1280 and 1440 px,
keyboard only, with reduced motion on.

**Box alignment is the check that matters most.** Open a portrait and a landscape image, turn on Show boxes, resize the
window, and confirm the boxes stay on the faces. If they drift, the stage geometry rules in §2 were broken.

## 12. Decisions

Decided 2026-11-06. These change behaviour or wording, not just appearance.

1. **The viewer opens on the redacted image.** `split` starts at 0%, so originals stay hidden until the user drags.
2. **The UI says "allow list" wherever users can read it.** API fields, error codes, routes and identifiers keep
   `whitelist`, as does the contract in `docs/`. Applied to frontend text so far. The backend messages are tracked in
   `web/docs/plan.md`.

## 13. Settings page (future phase)

Not started and not part of phases 1–5. This section covers the UI only. The backend work and its priorities are in
Phase 2 of `web/docs/plan.md`.

**Layout.** Route `/settings`, reached from the sidebar footer. One 640 px column of `.report-card`-style panels:
Account, Redaction defaults, Data and privacy, then Delete account last and set apart, using `.danger-button`.
Confirmations reuse `ui/Dialog` and `DeleteBatchDialog`.

- **Redaction defaults** reuses `RedactionConfigForm` as is.
- **Retention days:** lowering the value permanently deletes old batches on the next cleanup run, so the page must say
  how many will go and ask for confirmation.
- **Delete account** asks for the password.

**Left out on purpose:** email notifications and two-factor auth, since there is no mail system.
