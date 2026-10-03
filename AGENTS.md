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

## Data and security

- Passwords are salted and hashed with Node scrypt.
- Sessions use random HttpOnly cookies.
- Production deployments must use HTTPS so the server can set secure cookies.
- Do not expose the raw data directory through the web server.
- Back up the Docker boardy-data volume or the configured BOARDY_DATA_DIR before upgrades.
- The built-in file store is appropriate for a small self-hosted installation. A larger deployment should move persistence to a transactional database and object storage.

## Verification checklist

Before handing off changes:

1. Run npm run check.
2. Start the server and verify GET /api/health.
3. Verify the unauthenticated login/register surface.
4. Verify the demo workspace, card details, settings, and persistence after reload.
5. Check both dark and light themes and a narrow viewport.
6. Confirm Docker files still reference the correct port and data volume.
