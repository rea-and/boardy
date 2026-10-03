# Boardy instructions for Claude

Read AGENTS.md before making changes. It is the canonical guide for this repository.

## Quick start

~~~bash
npm run check
npm run dev
~~~

Open http://localhost:4173.

## Claude-specific expectations

- Treat Boardy as a production-oriented product, not a throwaway prototype.
- Preserve the polished working surface and existing visual language.
- Prefer small, verifiable changes over rewrites of unrelated files.
- Use the existing Node built-in server and browser client before adding dependencies.
- Never commit data/boardy.json, credentials, session cookies, or uploaded personal files.
- Run npm run check after JavaScript changes and exercise the affected flow in the browser when possible.
- Keep Docker and native Node instructions in README.md accurate when deployment behavior changes.
