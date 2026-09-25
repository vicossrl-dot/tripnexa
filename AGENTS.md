# AGENTS.md

## Project context

TripSync is a user-owned React + Vite application with a Node.js + Express backend, MySQL, and local session authentication. Start with README.md. Keep changes focused and preserve the existing interface.

## Key files

- src/api/client.js: browser client for the local Express API.
- server/app.js: HTTP routes and request protections.
- server/auth.js: local authentication.
- server/schema/: application entity definitions.
- server/migrate.js: initial MySQL table creation.
- .env: local secrets; never print or commit them.
- compose.yaml: optional local MySQL service.

## Development

Use npm run dev for frontend and backend together. Use npm run db:migrate after configuring a running MySQL database. Do not substitute another database for MySQL.

Run relevant tests and npm run build, npm run lint, and npm run typecheck. These checks pass; preserve the typed React component contracts and do not suppress checks to hide failures. Database integration tests require a separate MYSQL_TEST_DATABASE ending in _test. The full browser smoke test also checks wizard autosave and reload.

The base44/ directory and migration-backup/ are historical exports, not application runtime code. Do not install or reintroduce Base44 packages. Do not execute scripts or make changes inside migration-backup/.

Preserve server-side ownership checks, parameterized SQL, HTTP-only sessions, and private file access. Keep provider API keys on the server. Public sharing must never expose private notes, ticket URLs or hidden accommodation routes.
