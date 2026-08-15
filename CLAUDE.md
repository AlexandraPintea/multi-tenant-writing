# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

A multi-tenant rebuild of [alexandrapintea.eu](https://alexandrapintea.eu) and [roamliterary.com](https://roamliterary.com) on a single Django + Angular SSR stack, deployed via Docker to a Hetzner VPS. Both domains hit the same backend; the active tenant is identified per request from the Host header.

The canonical roadmap is `docs/claude-code-playbook.md` — it's a numbered, phase-by-phase plan (Phase 0 setup → Phase 7 CD), and each section spells out scope, learning goal, and verification steps. When the user references "Phase X.Y" or "the playbook", that's the file. Architecture decisions and the requirements spec live in `docs/architecture-v4-edited.docx` and `docs/requirements-v4-edited.docx`; treat the `*-edited.docx` variants as authoritative over the un-edited originals. Later decisions are recorded in the architecture doc as **red paragraphs** — §3.2 carries the Post/Author M2M revision. The playbook's addenda (A.1 Category, A.2 Post/Author M2M) sit after Phase 8 and are written in the same prompt-shaped format as the numbered steps.

Current state (August 2026): Phase 1 is complete — 1.1 through 1.7, plus both playbook addenda (A.1 Category, A.2 Post/Author M2M) — and the backend has a 78-test pytest suite behind a GitHub Actions workflow. Phase 2 is built out through 2.9: the SSR scaffold (2.1), `SiteConfigStore` (2.2), `LanguageStore` (2.3), the NGXS content slice (2.4), per-site routing with resolvers (2.5), the EN/RO toggle (2.6), Open Graph metadata (2.7), a 48-test Jest suite (2.8) and Playwright e2e across both tenants (2.9). Everything through 2.8 is merged to `main`; **2.9 is still on `phase-2.9-playwright`**. What is left in Phase 2 is **2.10, the frontend CI workflow**, and then Phase 3 onward.

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
- **A custom `form` on a `TranslatableAdmin` must subclass `TranslatableModelForm`.** Setting `form` replaces parler's default, and the translated fields are not model fields on the parent, so `fields = "__all__"` silently drops them — `PostAdminForm` was a plain `ModelForm` and the Post add page rendered with no title, body or excerpt at all. It fails quietly: no error, just a form missing the fields that matter.

`python manage.py seed_groups` creates the two groups and the demo accounts. **When you add a model the editors should manage, add it to `MANAGED_MODELS` in that command** — a missing entry is a 403 on that model's changelist, which is exactly what happened when Category landed.

### Translations (django-parler)

`Post`, `Page`, `Author` and `Category` are `TranslatableModel`s. Translatable fields (`title`, `body`, `excerpt`, `content`, `bio`, `name`) live in sibling `*_translation` tables keyed by `(master, language_code)`. `Category.slug` is deliberately **not** translated — slugs are language-agnostic admin URLs, while the label the reader sees is translated. The API resolves the effective language per request via `resolve_lang(request)` in `api/views.py`:

- `?lang=` not in the site's `enabled_languages` → silently coerced to `site.default_language`.
- Post **list**: only posts that have a translation in the active language appear (filters via `translations__language_code=lang` + `distinct()`).
- Post **detail**: if the post exists on this site but lacks the requested language, raise `PostNotAvailableInLanguage` — a custom DRF exception that returns a **404 with body `{"detail": "...", "available_languages": [...]}`**. The frontend's NGXS content state dispatches `LoadPostDetailNotInLanguage` on that shape rather than its failure action, and the language toggle dims the missing language off the `available_languages` it carries — so don't reduce it back to a plain 404 string. This is documented in architecture §4.3.

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

# Tests (78 of them; run from backend/, not the repo root)
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

```powershell
# From frontend/:
npm start                                   # ng serve on 4200 (dev SSR via Vite)
npm run build -- --configuration development
npm run serve:ssr:writing-frontend          # built SSR server on 4000
npm test                                    # Jest (55 tests) — never `ng test`
npx playwright test                         # e2e; needs a build + the backend up
```

Scaffolded (playbook 2.1) at `frontend/`: **Angular 21**, standalone throughout, SSR via `src/server.ts`, ngx-translate with `public/i18n/{en,ro}.json`, and `src/styles/_variables.scss` holding fallback theme custom properties. `SiteConfigStore` (`src/app/stores/site-config.store.ts`, playbook 2.2) is an `@ngrx/signals` store that fetches `/api/site-config/` and applies the theme to `document.documentElement` — guarded by `isPlatformBrowser`, since that effect is meaningless during SSR. It resolves the tenant from `window.location.host` in the browser and from the `REQUEST` token's Host header on the server, forwarded as `X-Site-Domain`.

**Bootstrap 5.3 is in, configured rather than adopted wholesale.** `src/styles/_bootstrap.scss` overrides the Sass variables — Montserrat/Poppins, pure black, no link recolouring, `$spacers` extended to 6/7/8 (4rem, 6rem, 9.5rem) — *before* forwarding `bootstrap/scss/bootstrap`, because Reboot would otherwise impose its own font stack and type scale on every page and undo the reference design. Resolution of `bootstrap/...` comes from `stylePreprocessorOptions.includePaths: ["node_modules"]` in angular.json. Bootstrap's `.visually-hidden` replaced the hand-written copy in `styles.scss`.

`bootstrap.bundle.min.js` is in angular.json's `scripts`, which is browser-only — the SSR bundle never evaluates it, so nothing needs an `isPlatformBrowser` guard *as long as it is only reached through `window.bootstrap`*. **Importing a Bootstrap JS module directly into a component (`import { Modal } from 'bootstrap'`) would run it during SSR and crash on `document`.** Nothing uses it yet.

The cost is real: Bootstrap's CSS plus that bundle put the production initial bundle at **668kB raw / 140kB transferred**, up from ~39kB, so the `initial` budget warning moved 500kB → 750kB. Trimming the Sass forward to the parts actually used, or dropping the JS until something needs it, wins most of it back.

**Every component is a folder of four files.** `pages/author-detail/` holds `author-detail.component.ts`, `.component.html`, `.component.scss` and `.component.spec.ts`, and the class is `AuthorDetailComponent`. No inline `template:` or `styles:`, and no component file sitting loose in `pages/` or `layouts/`. This is a deliberate departure from the Angular 21 CLI default (which omits the `.component` suffix and inlines small templates) — when a component grows, the file it lives in should not have to change shape. A component with nothing to style still gets its `.scss`, so the folder shape never varies. The root `App` is the one exception: it stays as `src/app/app.*`, which is Angular's own convention for the bootstrap component.

**One route tree for both tenants** (`src/app/app.routes.ts`, playbook 2.5). Every route is lazy via `loadComponent`, and each names a resolver from `src/app/routes/content.resolvers.ts` that **returns the NGXS dispatch observable** — that is what makes the router wait and SSR emit finished HTML rather than an empty shell, which is the whole justification for server rendering here. There is no per-site route table: `SiteHomeComponent` switches on the API's `layout` key (`grid` → `GridLayoutComponent`, anything else → `EditorialLayoutComponent`), so a third site is a database row, not a build target. `/about` and `/contact` share `StaticPageComponent`, passing the slug through route `data`.

`LanguageStore` (2.3) resolves the initial language from **localStorage in the browser and `Accept-Language` on the server** — two different sources because the browser's does not exist during SSR. They can disagree, and v1 accepts the resulting flicker; a cookie the server can read is the upgrade if it becomes annoying. Only an explicit choice is persisted: writing on initial resolution would lock a first-time reader into whatever default they landed on. `LanguageToggleComponent` (2.6) renders nothing on a single-language site, and **dims rather than hides** a language a post does not exist in — hiding makes the control jump between pages, and leaving it clickable walks the reader into an empty page (§9 risk row). `SeoService` (`src/app/core/seo.ts`, 2.7) writes title, Open Graph, Twitter Card and canonical during the server render, always as absolute URLs, and *removes* a tag rather than leaving a stale one, so navigating from a post with a cover image to one without does not unfurl the wrong picture.

**`ServerTranslateLoader`** (`src/app/i18n/server-translate.loader.ts`) reads `i18n/*.json` off disk during SSR instead of over HTTP: the browser loader's relative `/i18n/en.json` resolves against the *inbound* Host on the server, which once made the SSR process download the live Squarespace homepage. It is provided only in `app.config.server.ts`, so `node:fs` never reaches the client bundle, and it wraps the read in `PendingTasks` — SSR waits on HttpClient automatically but has no idea a bare fs promise is outstanding, and without it the first Romanian render finished with every UI string blank.

**Known `ng serve` noise:** that loader resolves `import.meta.dirname/../browser/i18n/<lang>.json`, a path that only exists in a real build (`dist/<app>/server/` next to `dist/<app>/browser/`). Under the Vite dev server `import.meta.dirname` is inside `.angular/vite-root/`, so every dev render logs `[i18n] could not read …\.angular\vite-root\browser\i18n\en.json (ENOENT)` and the server-rendered HTML carries untranslated keys until hydration fills them in. It is loud but harmless in dev — the `catchError` degrades to `{}` by design — and absent from a built SSR server. Don't "fix" it by pointing the browser loader at the filesystem.

**State management is three slices across two libraries.** `SiteConfigStore` and `LanguageStore` are `@ngrx/signals` SignalStores. Content is **NGXS** (`src/app/stores/content/`), not classic NgRx — the docs were amended in red (requirements §4.2, architecture §5.3) when that was decided. Pin `@ngxs/store` and `@ngxs/devtools-plugin` to **21**: the current major needs Angular 22, so NGXS and Angular have to be upgraded together. There is no first-party entity adapter, so the post collection is hand-rolled and **nested by language** (`postsByLang[lang][slug]`) — one slug carries different text per language, so a flat slug key would let a language switch overwrite the other copy and the cache guard would then serve the wrong text.

In NGXS the HTTP lives in the `@Action` handler, so `content.state.ts` is what NgRx would split into a reducer plus an effect. The 404-with-`available_languages` contract survives the switch: it dispatches `LoadPostDetailNotInLanguage`, never the failure action, and once the store knows a post lacks a language it does not ask again. Don't add Angular files outside `frontend/`, and don't introduce NgModules — the project is standalone-only by design.

### Frontend tests

**Jest, run with `npm test` — not `ng test`.** Angular 21's `@angular/build:unit-test` builder accepts only `karma` or `vitest` as its runner, so there is no way to drive Jest through the CLI; the angular.json `test` target was removed so there is exactly one entry point. `npm run test:coverage` prints the table.

Config lives in `jest.config.mjs` (`.mjs`, not `.ts`, so that reading the config does not require ts-node) and `setup-jest.ts`, which calls `setupZonelessTestEnv()` — the app has no `provideZoneChangeDetection`, so the zone.js environment would exercise a change-detection model production never runs. `transformIgnorePatterns` must keep transforming `@angular`, `@ngrx`, `@ngxs`, `@ngx-translate` and `rxjs`: they ship ESM, Jest runs CommonJS, and a new ESM dependency will fail with a bare `export` error in node_modules until it is added there.

Both earlier open decisions are now settled: the Roam layout key is `grid` (the seeder migrates an existing `collective` value in place), and the runner is Jest, which is what requirements §4.2 and architecture §5.6 always specified.

### Frontend e2e (Playwright)

`frontend/e2e/` (playbook 2.9) holds `smoke`, `deep-link`, `language-toggle` and `monolingual-post` specs, run with `npx playwright test` — there is no npm script. They are e2e rather than unit tests because what they assert only exists once the whole chain is assembled: Django resolving a tenant from the Host header, SSR rendering with that tenant's data, and the HTML arriving complete **before any JavaScript runs**. A unit test can prove a component renders a title; only this proves a crawler that never executes JS sees it.

**It needs a real build, not `ng serve`.** The `webServer` block starts `node dist/writing-frontend/server/server.mjs`, so run `npm run build -- --configuration development` first; Postgres and `runserver 8001` must already be up (the config lists these prerequisites but cannot start them).

`e2e/tenant-proxy.mjs` stands in for nginx: a browser sets Host from the URL and will not let a test override it, and hosts-file entries need administrator rights a checkout should not require. So port **4101 → `alexandrapintea.eu`** and **4102 → `roamliterary.com`**, each forwarding to the single SSR server on 4000 with the right Host attached — which is exactly nginx's production job (architecture §6.3), making it a faithful stand-in rather than a test-only shortcut.

`playwright-report/` and `test-results/` are gitignored on this branch only; until 2.9 merges they show up as untracked noise anywhere else.

## Code style

In the backend, use comments sparingly. Only comment complex code where the WHY is non-obvious (hidden constraints, subtle invariants, workarounds). Don't comment what the code already says.

## Working-directory specifics

### Windows / PowerShell

The dev environment is Windows + PowerShell. Bash is available via the Bash tool but `uv_spawn` of `bash.exe` sometimes fails with EPERM — fall back to PowerShell when that happens. Use PowerShell syntax: `$env:VAR`, no `&&`/`||`, `$null` not `/dev/null`.

**File encoding gotcha (already in memory):** `Set-Content -Encoding utf8` writes a BOM, which can break things that expect clean UTF-8. When PowerShell needs to write a UTF-8 file without a BOM, use `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))`. Prefer the `Write`/`Edit` tools over PowerShell for file content — they don't have this issue.

### Test data

`python manage.py seed_demo_data` creates `alexandrapintea.eu` (en+ro, `layout: "editorial"`) and `roamliterary.com` (en only, `layout: "grid"`), an Author profile for Alexandra on **each** site, three categories per site, an `about` Page per site, and two posts: one bilingual piece cross-posted to both sites with one author profile per site, and one English-only piece on alexandrapintea.eu.

Preserve both post fixtures when extending the seeder. The English-only post is what exercises the per-post language-coverage 404; the cross-posted one is what exercises the per-site author resolution. Note the two Author rows share the slug `alexandra-pintea` — that is deliberate, and it is why the A.2 bug stayed invisible until it was checked by primary key. Assert on `pk` or `bio`, never on `name`/`slug`.

The pytest suite in `backend/tests/` builds its own fixtures rather than calling the seeder, so changing the seeder for dev convenience will not break tests. `tests/test_seed_commands.py` covers the commands themselves.

**Middleware trap in tests:** an `X-Site-Domain` naming a Site the test never created falls back to `DEFAULT_SITE_DOMAIN`, so a cross-tenant 404 assertion quietly returns 200. Any test asserting on the *wrong* tenant must create both Sites.

### Local multi-tenant testing

Both domains resolve to the same backend; to exercise the multi-tenant routing locally without `/etc/hosts` edits, pass an `X-Site-Domain: roamliterary.com` header (or `alexandrapintea.eu`) to the API. The middleware reads that before falling back to `Host`, exactly to support this workflow and the eventual SSR-forwarding case.