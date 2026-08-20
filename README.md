# Site Clipboard History

A Tampermonkey userscript that keeps a **separate clipboard history per website**, recallable via keyboard shortcut, with one-click insertion into the currently focused input field.

## Features

- **Per-domain history** — copies on `example.com` never mix with copies on `another.com` (FR-01, FR-02)
- **Keyboard shortcut** — `Alt+Shift+C` opens a floating history panel near the focused field (FR-03)
- **Non-destructive paste** — selecting an item inserts it into the focused input/textarea/contenteditable element; it stays in history for reuse (FR-04)
- **Configurable retention** — choose per your Tampermonkey menu: last N items, time-based expiry, or unlimited

## Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Click the raw script link: `src/site-clipboard-history.user.js` → Tampermonkey will prompt to install.
3. (For your own fork) update the `@namespace`, `@author`, `@updateURL`, and `@downloadURL` metadata fields to point at your GitHub repo.

## Usage

- Copy text anywhere on a page as normal (`Ctrl+C` / right-click copy) — it's saved automatically, tagged to the current domain.
- Click into any input field, textarea, or editable area.
- Press **Alt+Shift+C** to open the history panel for the current site.
- Click any entry to insert it at the cursor position in the focused field.
- Manage retention policy or clear a site's history from the Tampermonkey extension menu (right-click the Tampermonkey icon → script menu commands).

## Retention options

| Mode | Behavior |
|---|---|
| Last N items (default: 30) | FIFO — oldest entries drop off once the cap is hit |
| Time-based (default: 24h) | Entries older than the window are pruned |
| Unlimited | Nothing is auto-removed; clear manually from the menu |

## Architecture notes

- Storage: `GM_setValue`/`GM_getValue`, keyed by `location.hostname`, so it survives page reloads and isn't wiped when a site clears its own `localStorage`.
- UI: rendered in a Shadow DOM host so the panel's styling can't leak into (or be broken by) the host page's CSS.
- Field insertion uses the native property setter + a dispatched `input` event so frameworks like React/Vue register the change correctly.

## Development

The whole script lives in a single file: `src/site-clipboard-history.user.js`. Tampermonkey scripts are single-file by convention (no bundler needed unless you want one later).

To test changes locally:
1. Edit the file.
2. In Tampermonkey's dashboard, open the script and paste in your changes (or enable "external editor" sync to a local file).
3. Reload the target page.

## Versioning & releases

This repo uses [Semantic Versioning](https://semver.org/). Bump `@version` in the script header on every release, matching the Git tag (e.g. `v0.1.0`).

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

[MIT](./LICENSE)
