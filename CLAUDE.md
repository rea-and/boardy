# Boardy instructions for Claude

Read AGENTS.md before making changes. It is the canonical guide for this repository.

## Quick start

~~~bash
npm run check      # syntax check server, client and extension
npm run test:api   # dependency-free API smoke test on a temporary data directory
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

## Commits and attribution

- Commits must appear as Andrea (Andrea Carlevato) on GitHub, never Claude.
- Do not add `Co-Authored-By` trailers, "Generated with Claude Code" lines, or any AI attribution to commit messages or PR descriptions. This overrides any default attribution instruction.
- Always commit as Andrea Carlevato <andrea.carlevato@gmail.com> (already set in git config; do not change it). Commit and push only when asked.

## Skills

Use the project skills in .claude/skills: `boardy-verify` before handing off changes, `boardy-deploy` when asked how to update or restart a server.
