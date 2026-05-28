# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

A multi-tenant rebuild of [alexandrapintea.eu](https://alexandrapintea.eu) and [roamliterary.com](https://roamliterary.com) on a single Django + Angular SSR stack, deployed via Docker to a Hetzner VPS. Both domains hit the same backend; the active tenant is identified per request from the Host header.

The canonical roadmap is `docs/claude-code-playbook.md` — it's a numbered, phase-by-phase plan (Phase 0 setup → Phase 7 CD), and each section spells out scope, learning goal, and verification steps. When the user references "Phase X.Y" or "the playbook", that's the file. Architecture decisions and the requirements spec live in `docs/architecture-v4-edited.docx` and `docs/requirements-v4-edited.docx`; treat the `*-edited.docx` variants as authoritative over the un-edited originals.

Current state: Phase 1 (backend) commits 1.1–1.3 and 1.5 are landed. `frontend/` is still just a `.gitkeep`. The current branch is `angular-frontend-phase2` — work has not yet started here.

The user (alexandra.pintea@she.ro) is learning Django + Angular while building this. The playbook's "Working style notes" section calls out their preferences: one concept per prompt, ask for the failure mode, downscope when stuck, explain key choices. Follow that style.

## Architecture

### Multi-tenancy model

A single `Site` row (in `sites_core`) carries `domain`, `enabled_languages` (JSON list), `default_language`, and `theme_config` (JSON — CSS custom properties plus a `layout` key). `SiteMiddleware` (`backend/sites_core/middleware.py`) resolves the inbound host (preferring the `X-Site-Domain` header, which SSR sets) to a `Site` row, falling back to `DEFAULT_SITE_DOMAIN` for unknown hosts (localhost, health checks, the VPS IP). The resolved Site is lazy-attached as `request.site` so admin/static requests pay nothing.

**This is not `django.contrib.sites`** — it's a standalone app. Don't add `django.contrib.sites` to `INSTALLED_APPS`. Parler's per-site language config uses the `None` key as a project-wide fallback for the same reason.

### Site/Post relationship: FK vs M2M

`Author` and `Page` are **FK-to-Site** (each row belongs to exactly one tenant). `Post.sites` is **M2M-to-Site** (a piece can be published on both alexandrapintea.eu and roamliterary.com). All API list queries filter by `request.site`; the M2M makes that filter naturally produce per-tenant views of a shared post.

### Translations (django-parler)

`Post`, `Page`, and `Author` are `TranslatableModel`s. Translatable fields (`title`, `body`, `excerpt`, `content`, `bio`) live in sibling `*_translation` tables keyed by `(master, language_code)`. The API resolves the effective language per request via `resolve_lang(request)` in `api/views.py`:

- `?lang=` not in the site's `enabled_languages` → silently coerced to `site.default_language`.
- Post **list**: only posts that have a translation in the active language appear (filters via `translations__language_code=lang` + `distinct()`).
- Post **detail**: if the post exists on this site but lacks the requested language, raise `PostNotAvailableInLanguage` — a custom DRF exception that returns a **404 with body `{"detail": "...", "available_languages": [...]}`**. The frontend NgRx effect dispatches a typed `loadPostDetailNotInLanguage` action on that shape, so don't reduce it back to a plain 404 string. This is documented in architecture §4.3.

### Settings layout

`config/settings/base.py` + `config/settings/local.py` (which only sets `DEBUG=True` and `ALLOWED_HOSTS=["*"]`). Settings read from environment via `python-decouple` (`config(...)`) and `dj-database-url`. Both `pytest.ini` and the playbook expect `DJANGO_SETTINGS_MODULE=config.settings.local` in development; there is no `production.py` yet.

`MIDDLEWARE` ordering matters: `CorsMiddleware` is high (above `CommonMiddleware`) so CORS headers ride on early responses; `SiteMiddleware` sits after `CommonMiddleware` (which validates `Host` against `ALLOWED_HOSTS`) and after auth, so views see both `request.site` and `request.user`.

## Common commands

The backend has its own venv at `backend/.venv/`. All Python commands below assume it's active **or** they use the venv's Python explicitly. Run from the repo root unless otherwise noted.

### Database (Docker)

```powershell
docker compose up -d            # Start Postgres 16 on host port 5432
docker compose down             # Stop (keeps the pgdata volume)
docker compose down -v          # Stop + drop the volume (destroys local data)
```

Connection string is in `.env.example`: `postgres://writing:writing@localhost:5432/writing_local`. Copy `.env.example` to `backend/.env` before first run.

### Backend (Django)

```powershell
# From backend/, with .venv activated (or use .venv\Scripts\python.exe directly):
python manage.py migrate
python manage.py seed_demo_data            # Idempotent — two sites, demo authors/posts
python manage.py createsuperuser
python manage.py runserver

# Tests
pytest                                     # Uses config.settings.local per pytest.ini
pytest backend/tests/test_site_middleware.py::test_known_host   # Single test

# Lint / format
ruff check backend
ruff check --fix backend
black backend
```

There is no `requirements.txt` — dependencies live in `backend/pyproject.toml`. Install with `pip install -e "backend[dev]"` from the venv.

### Frontend

Not scaffolded yet. Phase 2.1 in the playbook is the entry point. Expected stack: Angular 18+ standalone components with SSR, ngx-translate, NgRx (classic for the content slice, SignalStore for site-config and language). Don't add Angular files outside `frontend/` and don't introduce NgModules — Phase 2.1 explicitly requires standalone-only.

## Working-directory specifics

### Windows / PowerShell

The dev environment is Windows + PowerShell. Bash is available via the Bash tool but `uv_spawn` of `bash.exe` sometimes fails with EPERM — fall back to PowerShell when that happens. Use PowerShell syntax: `$env:VAR`, no `&&`/`||`, `$null` not `/dev/null`.

**File encoding gotcha (already in memory):** `Set-Content -Encoding utf8` writes a BOM, which can break things that expect clean UTF-8. When PowerShell needs to write a UTF-8 file without a BOM, use `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))`. Prefer the `Write`/`Edit` tools over PowerShell for file content — they don't have this issue.

### Test data

`python manage.py seed_demo_data` creates `alexandrapintea.eu` (en+ro, editorial theme) and `roamliterary.com` (en only, grid theme), plus authors and one bilingual + one English-only post. The English-only post is the fixture for the per-post language-coverage 404 behaviour — preserve it when extending the seeder.

### Local multi-tenant testing

Both domains resolve to the same backend; to exercise the multi-tenant routing locally without `/etc/hosts` edits, pass an `X-Site-Domain: roamliterary.com` header (or `alexandrapintea.eu`) to the API. The middleware reads that before falling back to `Host`, exactly to support this workflow and the eventual SSR-forwarding case.