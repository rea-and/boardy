---
name: boardy-verify
description: Verify Boardy changes before handing off. Runs the syntax check, the API smoke test, and a real-browser check of the affected UI flow. Use after any change to server/index.js, public/app.js or public/styles.css.
---

# Verify Boardy changes

Run from the repository root. Stop and fix the first failing step.

1. `npm run check` — syntax-checks the server, client and extension.
2. `npm run test:api` — starts Boardy on a temporary data directory and random port and checks sessions, board revisions and conflicts, the extension card endpoint, explicit board deletion, the 8 MB body limit and the static path guard. Extend `test/api-smoke.mjs` whenever you change `server/index.js` behaviour.
3. Exercise the affected UI flow in a real browser. No browser tooling is installed in the repo, so drive headless Chrome over the DevTools protocol with a throwaway Node script kept OUTSIDE the repo (scratchpad):
   - Start the server: `BOARDY_DATA_DIR=<tmp> PORT=4199 node server/index.js &`
   - Start Chrome: `TZ=America/Los_Angeles "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp> about:blank &`
   - Connect to the WebSocket URL from `http://127.0.0.1:9333/json`, register a user with `fetch('/api/register', ...)`, reload, then use `Runtime.evaluate` to click elements (`[data-action="..."]`), set input values and dispatch `KeyboardEvent`s. `public/app.js` is an ES module, so its functions are not on `window`; assert on the DOM and on `/api/session` instead.
   - To seed odd data (overdue dates, hostile ids), GET `/api/session`, edit the JSON and PUT it to `/api/data`, then reload the page.
   - Capture a 375 px screenshot with `Emulation.setDeviceMetricsOverride` and `Page.captureScreenshot` when layout changed.
4. Check both a dark and a light theme and a narrow viewport for visual changes.
5. Kill the server and Chrome and delete the temp directories. Never leave `data/boardy.json` modified.

Always cover these regressions when touching saving or dialogs: a stale tab must not overwrite an extension-clipped card; the due-date dialog must return to the card dialog; long unbroken URLs must wrap inside cards; Undo must restore deleted cards and checklist items.
