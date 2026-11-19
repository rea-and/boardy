# Boardy agent instructions

## Project purpose

Boardy is a self-hosted kanban workspace with account authentication, multiple boards, lists, rich cards, attachments, themes, wallpapers, and persistent local data.

## Repository layout

- public/index.html — document shell and metadata.
- public/styles.css — product theme, layout, responsive behavior, and component styling.
- public/app.js — browser application state, rendering, interactions, and API calls.
- server/index.js — Node.js HTTP server, authentication, sessions, persistence, and static file serving.
- data/boardy.json — runtime data created locally; never commit or copy it into source control.
- Dockerfile and docker-compose.yml — container deployment.

## Development commands

The project intentionally has no runtime dependencies.

~~~bash
npm run check     # syntax-check server and client JavaScript
npm run dev       # restart the server when source files change
npm start         # run the production-style server
~~~

The default local URL is http://localhost:4173.

## Implementation rules

- Preserve the self-contained, dependency-free Node.js runtime unless a feature genuinely requires a dependency.
- Use apply_patch for source edits.
- Keep user-visible text plain, specific, and product-oriented.
- Escape user-controlled values before inserting them into HTML.
- Keep all persisted workspace changes flowing through PUT /api/data.
- Keep passwords out of application state and never log credentials, cookies, or tokens.
- Keep attachments size-limited; attachment data is stored with workspace JSON.
- Maintain keyboard access, visible focus states, usable contrast, and responsive behavior.
- Do not replace the working product surface with a landing page or a placeholder screen.

## Architecture and persistence rules

- server/index.js keeps the whole store in memory (`store`, loaded once at startup). Handlers must mutate it synchronously after `await readBody()` and then call `writeStore()`. Never re-read the file per request.
- Every board has an integer `rev`. Bump it in any code path that changes a board (`mergeIncomingBoard`, `POST /api/cards`). `PUT /api/data` returns `{ ok, revs, conflicts }`; a client with an older `rev` loses and must reload.
- Boards are deleted only through `deletedBoardIds` in the PUT payload, never by omission.
- `publicShare` and board `members` are server-owned and are never taken from client payloads.
- Client saves go through `persist()` / `runSave()` in public/app.js. Do not call `PUT /api/data` directly. `refreshWorkspace()` reloads after conflicts and on tab focus.
- Request bodies are capped at 8 MB (413). Keep the client-side `workspaceFits()` guard in front of anything that adds attachments or images.
- Escape every interpolated value with `esc()`, including ids; pass colors through `safePublicColor()`; only render `data:image/` URLs in `<img>`.
- Destructive card and checklist actions use `notify(message, { actionLabel, onAction })` for Undo instead of a confirm dialog. Board deletion and backup import keep their confirm dialogs.
- Dialogs opened from the card dialog must keep `previousModal` so closing them returns to the card (`openInputModal` does this).

## Data and security

- Passwords are salted and hashed with Node scrypt.
- Sessions use random HttpOnly cookies.
- Production deployments must use HTTPS so the server can set secure cookies.
- Do not expose the raw data directory through the web server.
- Back up the Docker boardy-data volume or the configured BOARDY_DATA_DIR before upgrades.
- The built-in file store is appropriate for a small self-hosted installation. A larger deployment should move persistence to a transactional database and object storage.

## Git and commits

- Commits are authored by Andrea only. Never add `Co-Authored-By`, "Generated with Claude Code", or any other AI attribution to commit messages or pull request descriptions.
- Always commit as Andrea Carlevato <andrea.carlevato@gmail.com> (already set in git config; do not change it). Commit only when asked, and never commit data/boardy.json.

## Project skills

Task recipes live in .claude/skills: `boardy-verify` (check, API smoke test, real-browser UI checks) and `boardy-deploy` (update and restart a server).

## Verification checklist

Before handing off changes:

1. Run npm run check and npm run test:api.
2. Start the server and verify GET /api/health.
3. Verify the unauthenticated login/register surface.
4. Verify the demo workspace, card details, settings, and persistence after reload.
5. Check both dark and light themes and a narrow viewport.
6. Confirm Docker files still reference the correct port and data volume.
