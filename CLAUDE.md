# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

A multi-tenant rebuild of [alexandrapintea.eu](https://alexandrapintea.eu) and [roamliterary.com](https://roamliterary.com) on a single Django + Angular SSR stack, deployed via Docker to a Hetzner VPS. Both domains hit the same backend; the active tenant is identified per request from the Host header.

The canonical roadmap is `docs/claude-code-playbook.md` — it's a numbered, phase-by-phase plan (Phase 0 setup → Phase 7 CD), and each section spells out scope, learning goal, and verification steps. When the user references "Phase X.Y" or "the playbook", that's the file. Architecture decisions and the requirements spec live in `docs/architecture-v4-edited.docx` and `docs/requirements-v4-edited.docx`; treat the `*-edited.docx` variants as authoritative over the un-edited originals. Later decisions are recorded in the architecture doc as **red paragraphs** — §3.2 carries the Post/Author M2M revision. The playbook's addenda (A.1 Category, A.2 Post/Author M2M) sit after Phase 8 and are written in the same prompt-shaped format as the numbered steps.

Current state (August 2026): Phase 1 is complete — 1.1 through 1.7, plus both playbook addenda (A.1 Category, A.2 Post/Author M2M). The backend has a 77-test pytest suite and a GitHub Actions workflow. On the frontend, 2.1 (Angular SSR scaffold) and 2.2 (siteConfig SignalStore) are done; **2.3 onward is not started** — there is no language store, no NgRx content slice, no routes (`app.routes.ts` is an empty array), and no components.

**Branch from `main`.** Finished work is merged there via GitHub PRs, and local `main` is usually behind what was merged, so run `git fetch origin main:main` first. Branch names follow the playbook step: `phase-1.6-pytest-suite`, `phase-a1-category`.

Before building anything a playbook step describes, check whether it already exists — the numbering has drifted from reality more than once, and 1.5 in particular was fully implemented before it was ever "started".

The user (alexandra.pintea@she.ro) is learning Django + Angular while building this. The playbook's "Working style notes" section calls out their preferences: one concept per prompt, ask for the failure mode, downscope when stuck, explain key choices. Follow that style.

## Architecture

### Multi-tenancy model

A single `Site` row (in `sites_core`) carries `domain`, `enabled_languages` (JSON list), `default_language`, and `theme_config` (JSON — CSS custom properties plus a `layout` key). `SiteMiddleware` (`backend/sites_core/middleware.py`) resolves the inbound host (preferring the `X-Site-Domain` header, which SSR sets) to a `Site` row, falling back to `DEFAULT_SITE_DOMAIN` for unknown hosts (localhost, health checks, the VPS IP). The resolved Site is lazy-attached as `request.site` so admin/static requests pay nothing.

**This is not `django.contrib.sites`** — it's a standalone app. Don't add `django.contrib.sites` to `INSTALLED_APPS`. Parler's per-site language config uses the `None` key as a project-wide fallback for the same reason.

### Site relationships: FK vs M2M

`Author`, `Page` and `Category` are **FK-to-Site** (each row belongs to exactly one tenant). `Post.sites` is **M2M-to-Site** (a piece can be published on both alexandrapintea.eu and roamliterary.com). All API list queries filter by `request.site`; the M2M makes that filter naturally produce per-tenant views of a shared post.

`Post.authors` is **M2M-to-Author**, holding at most one Author per target site — the per-site profile the piece appears under on that site. It was a single FK until addendum A.2; because Author is per-site, a cross-posted piece could only point at one site's profile, so the other site's author page listed nothing and its post cards rendered the foreign site's name and slug. Use `post.author_for_site(site)`; serializers resolve it from `context["site"]`.

Two rules are enforced in `Post.clean()` and mirrored in `PostAdminForm` (`content/admin.py`): every attached Author, and the Category if set, must belong to one of the post's target sites; and a post carries at most one Author per site. Neither can be a database `CheckConstraint` — both compare against an M2M. `Post.clean()` only runs for saved rows, since on a new Post the M2M lives in the form's `cleaned_data`, so **the form is what catches a bad creation**.

`Post.category` is still a single nullable FK. Known consequence, not yet resolved: a cross-posted piece carries one category belonging to one site, so roamliterary.com can render a label owned by alexandrapintea.eu — the same shape as the author bug A.2 fixed.

### Tenant isolation in the admin

`SiteScopedAdmin` (`backend/admin_scoped/admin.py`) is the single chokepoint. It reads the editing user's tenant from `people.UserProfile` (OneToOne to User, FK to Site), bypasses everything for superusers, and **fails closed** — a staff user with no profile sees nothing rather than falling through to the unscoped queryset.

It overrides `get_queryset` (which also backs `get_object`, so a hand-typed change-form URL for another tenant 404s, and Django's autocomplete endpoint, which calls the *target* admin's `get_queryset`), `formfield_for_foreignkey`, `formfield_for_manytomany` (Post's `sites` and `authors` are M2M — the FK hook never sees them), and `get_list_filter` (the site filter enumerates every Site by domain). Subclasses set `site_field` — `"sites"` on Post, since it reaches Site through the M2M.

Two admin traps already hit here:
- **Never use `autocomplete_fields` for `sites`.** Autocomplete resolves choices through the target model's admin, and `SiteAdmin` is unscoped, so it would offer the other tenant. `filter_horizontal` goes through `formfield_for_manytomany` and is scoped.
- **`list_filter` on a related field needs `RelatedOnlyFieldListFilter`.** A bare `"category"` enumerates every row in the table; the related-only variant derives choices from `model_admin.get_queryset(request)`.

`python manage.py seed_groups` creates the two groups and the demo accounts. **When you add a model the editors should manage, add it to `MANAGED_MODELS` in that command** — a missing entry is a 403 on that model's changelist, which is exactly what happened when Category landed.

### Translations (django-parler)

`Post`, `Page`, `Author` and `Category` are `TranslatableModel`s. Translatable fields (`title`, `body`, `excerpt`, `content`, `bio`, `name`) live in sibling `*_translation` tables keyed by `(master, language_code)`. `Category.slug` is deliberately **not** translated — slugs are language-agnostic admin URLs, while the label the reader sees is translated. The API resolves the effective language per request via `resolve_lang(request)` in `api/views.py`:

- `?lang=` not in the site's `enabled_languages` → silently coerced to `site.default_language`.
- Post **list**: only posts that have a translation in the active language appear (filters via `translations__language_code=lang` + `distinct()`).
- Post **detail**: if the post exists on this site but lacks the requested language, raise `PostNotAvailableInLanguage` — a custom DRF exception that returns a **404 with body `{"detail": "...", "available_languages": [...]}`**. The planned frontend NgRx effect dispatches a typed `loadPostDetailNotInLanguage` action on that shape, so don't reduce it back to a plain 404 string. This is documented in architecture §4.3.

A post that isn't published to *this site* is a different failure and returns a **plain 404 with no hint** — offering `available_languages` there would invite the frontend to suggest a language switch that cannot help. Both shapes are covered in `tests/test_api_language_coverage.py`.

**Publishing rule** (§4.3, and the §9 risk row), in `Post.clean()`: `is_published` requires a non-empty title *and* body in at least one language the post's target sites enable — one language, not all. That asymmetry is what lets an English-only piece live on a bilingual site while guaranteeing no reader lands on an empty page.

### Settings layout

`config/settings/base.py` + `config/settings/local.py` (which sets `DEBUG=True`, `ALLOWED_HOSTS=["*"]`, and the dev `CORS_ALLOWED_ORIGINS` — 4200 for `ng serve`, 4000 for the SSR dev server). `base.py` trusts **no** CORS origin by default, so production must name the SSR origin explicitly. Settings read from environment via `python-decouple` (`config(...)`) and `dj-database-url`. Both `pytest.ini` and the playbook expect `DJANGO_SETTINGS_MODULE=config.settings.local` in development; there is no `production.py` yet.

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
python manage.py seed_demo_data            # Idempotent — sites, authors, categories, posts, pages
python manage.py seed_groups               # Idempotent — the two groups + demo staff accounts
python manage.py createsuperuser
python manage.py runserver 8001            # 8001, matching frontend environment.development.ts

# Tests (77 of them; run from backend/, not the repo root)
pytest
pytest tests/test_site_middleware.py::test_known_host_resolves_to_its_site

# Lint / format — invoke black via -m; black.exe hits "Access is denied" in this sandbox
ruff check .
ruff check --fix .
python -m black .
```

**Dependencies.** Direct dependencies live in `backend/pyproject.toml`, pinned with `~=` (patches float, minors don't) except `ruff` and `black`, which are pinned exactly because a new release changes what "correct" means and would fail CI on untouched code. `requirements.txt` (runtime) and `requirements-dev.txt` (runtime + dev) are **generated lock files** with hashes — CI and the future Docker image install from those, never from `pyproject.toml`. After changing a dependency, regenerate both with the `docker run` command recorded in `pyproject.toml`: they must be compiled **inside Linux**, because `pip-compile` resolves for the platform it runs on and emits no environment markers, so a Windows-generated lock silently pins `tzdata`/`colorama` and would omit any Linux-only dependency.

### CI

`.github/workflows/backend-ci.yml` runs on every PR touching `backend/**`: `pip install --require-hashes -r requirements-dev.txt`, then `ruff check .`, `black --check .`, `pytest`. Postgres 16 runs as a service container rather than SQLite, because the suite leans on JSONField lookups, `distinct()` over the parler translations join, and NULL ordering — matching the production engine is the point. There is no frontend workflow yet (playbook 2.10).

### Frontend

Scaffolded (playbook 2.1) at `frontend/`: **Angular 21**, standalone throughout, SSR via `src/server.ts`, ngx-translate with `public/i18n/{en,ro}.json`, and `src/styles/_variables.scss` holding fallback theme custom properties. `SiteConfigStore` (`src/app/stores/site-config.store.ts`, playbook 2.2) is an `@ngrx/signals` store that fetches `/api/site-config/` and applies the theme to `document.documentElement` — guarded by `isPlatformBrowser`, since that effect is meaningless during SSR. It resolves the tenant from `window.location.host` in the browser and from the `REQUEST` token's Host header on the server, forwarded as `X-Site-Domain`.

Still to build: 2.5 routes/layouts, 2.6 EN/RO toggle, 2.7 Open Graph meta, 2.9 Playwright.

**State management is three slices across two libraries.** `SiteConfigStore` and `LanguageStore` are `@ngrx/signals` SignalStores. Content is **NGXS** (`src/app/stores/content/`), not classic NgRx — the docs were amended in red (requirements §4.2, architecture §5.3) when that was decided. Pin `@ngxs/store` and `@ngxs/devtools-plugin` to **21**: the current major needs Angular 22, so NGXS and Angular have to be upgraded together. There is no first-party entity adapter, so the post collection is hand-rolled and **nested by language** (`postsByLang[lang][slug]`) — one slug carries different text per language, so a flat slug key would let a language switch overwrite the other copy and the cache guard would then serve the wrong text.

In NGXS the HTTP lives in the `@Action` handler, so `content.state.ts` is what NgRx would split into a reducer plus an effect. The 404-with-`available_languages` contract survives the switch: it dispatches `LoadPostDetailNotInLanguage`, never the failure action, and once the store knows a post lacks a language it does not ask again. Don't add Angular files outside `frontend/`, and don't introduce NgModules — the project is standalone-only by design.

Two open frontend decisions, both worth settling before 2.5 and 2.8:
- **Layout key mismatch.** `seed_demo_data` writes `"layout": "collective"` for roamliterary.com, but playbook 2.5 switches on `layout === 'grid'`. Pick one before writing the layout switch.
- **Jest vs Vitest.** Angular 21 scaffolded **Vitest** (`vitest` + `jsdom` in devDependencies), while requirements §4.2 and architecture §5.6 name Jest. Recommendation is to keep Vitest and amend the docs rather than fight the builder.

## Code style

In the backend, use comments sparingly. Only comment complex code where the WHY is non-obvious (hidden constraints, subtle invariants, workarounds). Don't comment what the code already says.

## Working-directory specifics

### Windows / PowerShell

The dev environment is Windows + PowerShell. Bash is available via the Bash tool but `uv_spawn` of `bash.exe` sometimes fails with EPERM — fall back to PowerShell when that happens. Use PowerShell syntax: `$env:VAR`, no `&&`/`||`, `$null` not `/dev/null`.

**File encoding gotcha (already in memory):** `Set-Content -Encoding utf8` writes a BOM, which can break things that expect clean UTF-8. When PowerShell needs to write a UTF-8 file without a BOM, use `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))`. Prefer the `Write`/`Edit` tools over PowerShell for file content — they don't have this issue.

### Test data

`python manage.py seed_demo_data` creates `alexandrapintea.eu` (en+ro, `layout: "editorial"`) and `roamliterary.com` (en only, `layout: "collective"`), an Author profile for Alexandra on **each** site, three categories per site, an `about` Page per site, and two posts: one bilingual piece cross-posted to both sites with one author profile per site, and one English-only piece on alexandrapintea.eu.

Preserve both post fixtures when extending the seeder. The English-only post is what exercises the per-post language-coverage 404; the cross-posted one is what exercises the per-site author resolution. Note the two Author rows share the slug `alexandra-pintea` — that is deliberate, and it is why the A.2 bug stayed invisible until it was checked by primary key. Assert on `pk` or `bio`, never on `name`/`slug`.

The pytest suite in `backend/tests/` builds its own fixtures rather than calling the seeder, so changing the seeder for dev convenience will not break tests. `tests/test_seed_commands.py` covers the commands themselves.

**Middleware trap in tests:** an `X-Site-Domain` naming a Site the test never created falls back to `DEFAULT_SITE_DOMAIN`, so a cross-tenant 404 assertion quietly returns 200. Any test asserting on the *wrong* tenant must create both Sites.

### Local multi-tenant testing

Both domains resolve to the same backend; to exercise the multi-tenant routing locally without `/etc/hosts` edits, pass an `X-Site-Domain: roamliterary.com` header (or `alexandrapintea.eu`) to the API. The middleware reads that before falling back to `Host`, exactly to support this workflow and the eventual SSR-forwarding case.