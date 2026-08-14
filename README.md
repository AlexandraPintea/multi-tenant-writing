# multi-tenant-writing

A multi-tenant rebuild of [alexandrapintea.eu](https://alexandrapintea.eu) and [roamliterary.com](https://roamliterary.com) on a shared Django + Angular SSR + Docker stack.

Both domains are served by one Django backend and one Angular SSR app. The active tenant is decided per request from the `Host` header, which selects the site's content, theme, layout and languages.

## Structure

| Folder | Purpose |
|--------|---------|
| `backend/` | Django project — REST API, multi-tenant data layer, auth |
| `frontend/` | Angular SSR app — shared codebase, per-tenant theming |
| `docs/` | Architecture decisions, runbooks, and project documentation |

Prerequisites: Python 3.12, Node 22, Docker. The phase-by-phase plan is `docs/claude-code-playbook.md`.

## Running locally

```powershell
docker compose up -d                      # Postgres 16 on 5432

cd backend                                # with .venv activated
python manage.py migrate
python manage.py seed_demo_data           # two sites, authors, categories, posts, pages
python manage.py seed_groups              # admin groups + demo staff accounts
python manage.py runserver 8001

cd ../frontend
npm run build -- --configuration development
node dist/writing-frontend/server/server.mjs   # SSR on 4000
```

Because the tenant comes from the `Host` header, `http://localhost:4000` always resolves to the default site (`DEFAULT_SITE_DOMAIN`). To see the other tenant, send the header yourself:

```powershell
curl.exe -s -H "Host: roamliterary.com" http://localhost:4000/
```

## Tests

```powershell
cd backend  && pytest                     # 77 tests, needs Postgres running
cd frontend && npm test                   # Jest — note: NOT `ng test`, see below
cd frontend && npx playwright test        # end-to-end, needs the stack above running
```

`ng test` does not work by design. Angular 21's unit-test builder only supports `karma` and `vitest`, and this project uses Jest (requirements §4.2), so the `test` target was removed and `npm test` is the single entry point.

### End-to-end tests and the two hostnames

Playwright drives both tenants without any hosts-file entries or administrator rights. `e2e/tenant-proxy.mjs` listens on two ports and forwards to the single SSR server with the appropriate `Host` attached — the same job nginx does in production:

| URL | Tenant |
|-----|--------|
| `http://localhost:4101` | alexandrapintea.eu |
| `http://localhost:4102` | roamliterary.com |

Playwright starts the SSR server and the proxy itself; **Postgres and Django must already be running**, and the frontend must have been built.

If you would rather browse the tenants by name, add these to `C:\Windows\System32\drivers\etc\hosts` (needs administrator) and visit `http://alexandrapintea.local:4000`. Both names are already in `angular.json`'s `allowedHosts`:

```
127.0.0.1  alexandrapintea.local
127.0.0.1  roamliterary.local
```