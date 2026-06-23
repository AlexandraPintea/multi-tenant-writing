# Claude Code Playbook
**Multi-tenant rebuild of alexandrapintea.eu and roamliterary.com**
**Companion to architecture-v4.docx and requirements-v4.docx**
**Last updated: 22 May 2026**

---

## How to use this playbook

This is a numbered list of prompts to feed Claude Code, in order, organized by phase. Each entry has the same shape:

- **Scope** — what this prompt produces.
- **Learning goal** — what you should walk away understanding.
- **Prompt** — copy-paste text for Claude Code.
- **Verify** — what to check before moving to the next item.

A few ground rules to get learning value out of working with Claude Code:

1. **Read the diff before accepting.** When Claude Code writes a file, skim the whole file. If something is unfamiliar (a decorator, a CLI flag, a config option), pause and ask "what does X do and why did you use it?" before continuing.
2. **Ask for the why.** Every prompt below ends with "Explain the key choices you made and why." Keep that habit. The code is half the value; the reasoning is the other half.
3. **Resist single-shot prompts.** If a prompt feels like it would produce 800 lines of code, break it down — ask for the scaffold first, then add features one at a time.
4. **Commit between prompts.** Every numbered entry below is a logical unit of work. Commit when verification passes, before moving on. You'll thank yourself when something breaks and you need to bisect.
5. **Run the tests after every change.** From Phase 1 onward, tests exist. If a prompt's verification step doesn't include running tests, run them anyway.
6. **The prompts below are a starting point, not a script.** Adapt them to what's actually in your repo at the time. If you got distracted and made unrelated changes, mention that in the next prompt.

---

## Phase 0 — Setup (1 weekend)

### 0.1 Verify local tooling

**Scope.** Confirm Python 3.12, Node 22, Docker Desktop, Angular CLI, Git, and VS Code are installed and working.

**Learning goal.** A minimum-viable dev environment. No code yet.

**Prompt.**
> I'm starting a Django + Angular SSR project that will run in Docker. Please:
> 1. Tell me how to verify on Windows that I have Python 3.12, Node 22, Docker Desktop, Angular CLI, and Git installed and working. For each tool, give me the version command and the expected output range.
> 2. For anything that's missing or outdated, give me the official installer link (no Chocolatey, no winget — I want to know what I'm installing).
> 3. After install, walk me through verifying that `docker run hello-world` works.

**Verify.** Each `--version` command runs and prints a version inside the expected range. `docker run hello-world` succeeds.

### 0.2 Repository skeleton and commit conventions

**Scope.** A clean monorepo with `/backend`, `/frontend`, `/docs`, `.gitignore`, README, and one initial commit.

**Learning goal.** Repo layout choices, .gitignore patterns for Django + Angular + Docker, conventional commit style.

**Prompt.**
> The repository at the current path already has /backend, /frontend, /docs folders (currently empty with .gitkeep). Please:
> 1. Write a top-level `.gitignore` suitable for Django + Angular + Docker. Comment each section so I understand what each pattern catches.
> 2. Write a README.md that links to docs/architecture-v4.docx and docs/requirements-v4.docx, lists prerequisites (Python 3.12, Node 22, Docker), and has a "Quick start" section that for now just says "see Phase 1 in claude-code-playbook.md".
> 3. Suggest a commit message convention (e.g., conventional commits — feat:, fix:, chore:) and explain the rationale.
> 4. Explain each key choice.

**Verify.** `git status` shows expected ignored files when you create dummy artifacts (e.g., `pycache`, `node_modules`). README renders correctly on GitHub.

### 0.3 Linux mini-course (external, no Claude Code)

**Scope.** Off-Claude-Code work. Do this before Phase 4.

**Learning goal.** Filesystem, permissions, SSH, env vars, basic networking — enough to operate a VPS without panicking.

**Action.** Two to three hours on linuxjourney.com (modules: Grasshopper, Networking Nomad, Permissions, Processes). Spend an extra hour SSHing into a throwaway VPS (Hetzner has a CX11 for €4/month for the duration of the exercise — kill it when you're done).

---

## Phase 1 — Backend (week 1–2)

### 1.1 Django project scaffold + Postgres in Docker (dev only)

**Scope.** Empty Django 5 project that runs locally, with Postgres 16 in a Docker container that Django connects to.

**Learning goal.** Django project structure, settings module layout, connecting Django to Postgres via DATABASE_URL, `docker-compose.yml` basics.

**Prompt.**
> Create the Django project at /backend with the layout from architecture-v4.docx §4.1 (config/, sites_core/, content/, people/, api/, admin_scoped/, tests/, pyproject.toml, Dockerfile placeholder). For now leave the apps empty — just register them in INSTALLED_APPS.
>
> Database: Postgres 16 running in a Docker container. Add a docker-compose.yml at the repo root that defines only the postgres service for now (named volume `pgdata`, exposed on host port 5432 for local DB GUIs). Django settings should read DATABASE_URL from .env using python-decouple or django-environ — pick one and explain why.
>
> Add a pyproject.toml configured for ruff + black, and a pytest.ini that sets DJANGO_SETTINGS_MODULE.
>
> Explain each key choice and tell me exactly which commands to run to verify Django connects to Postgres and migrations work.

**Verify.** `docker compose up -d postgres` runs Postgres. `python manage.py migrate` succeeds. `python manage.py runserver` shows the Django welcome page. `pytest` runs with zero tests, zero errors.

### 1.2 Multi-tenant data model (Site, Author, Post, Page) with django-parler

**Scope.** The four core models from architecture §3.2 and §4.3, with translatable fields wired via django-parler.

**Learning goal.** ForeignKey vs ManyToManyField, JSONField, model methods, django-parler's translation tab mechanic, why translation rows are in a sibling table.

**Prompt.**
> Implement the four core models from architecture-v4.docx §3.2:
> - sites_core/models.py: Site (domain, name, default_language, enabled_languages as JSONField, theme_config as JSONField). Extend django.contrib.sites.models.Site or create a new model — pick the cleaner option and explain why.
> - people/models.py: Author (FK to Site, name, slug, location, portrait ImageField, social_links JSONField; bio is translatable via parler).
> - content/models.py: Post (FK to Author for authorship, M2M to Site for publish targets, slug, cover_image, published_at, is_published; title/body/excerpt translatable via parler) and Page (FK to Site, slug, translatable content).
>
> Wire up django-parler in settings, add the migration, and create a `seed_demo_data` management command that inserts two Sites (alexandrapintea.eu with enabled_languages=['en','ro'], roamliterary.com with ['en']), one bilingual Post on both sites, one English-only Post on alexandrapintea.eu, and two Authors (Alexandra on each site).
>
> Explain each modeling choice, including why Author is FK-to-Site and Post is M2M-to-Site.

**Verify.** `python manage.py makemigrations && migrate` runs clean. `python manage.py seed_demo_data` populates the demo content. The Django admin (after we wire it next) will show both bilingual and English-only posts.

### 1.3 Site-identification middleware

**Scope.** Middleware that resolves `request.get_host()` to a Site row and attaches it to `request`.

**Learning goal.** Django middleware lifecycle, request augmentation, fallback behaviour for unknown hosts.

**Prompt.**
> Implement the Site-identification middleware described in architecture-v4.docx §3.1. It should:
> 1. Read `request.get_host()` (or the `X-Site-Domain` header if present, since SSR will use that) and resolve to a Site row.
> 2. Attach the Site to `request.site`.
> 3. Fall back to a configurable default Site (settings.DEFAULT_SITE_DOMAIN) for requests with unknown hosts — e.g. health checks or local dev with `localhost`.
> 4. Be ordered correctly in MIDDLEWARE in settings.
>
> Add a corresponding pytest test that exercises the three paths: known host, X-Site-Domain header, and unknown host falling back to default.
>
> Explain the order in MIDDLEWARE and the fallback choice.

**Verify.** `pytest backend/tests/test_site_middleware.py` passes. Open the Django shell, build a fake request, and confirm `request.site` resolves as expected.

### 1.4 SiteScopedAdmin mixin and per-site groups

**Scope.** The SiteScopedAdmin mixin from architecture §3.3 and the two Django groups (alexandra_admin, roam_editors).

**Learning goal.** ModelAdmin internals, `get_queryset`, `formfield_for_foreignkey`, autocomplete endpoints, Django permission groups.

**Prompt.**
> Implement the SiteScopedAdmin mixin from architecture-v4.docx §3.3 in admin_scoped/admin.py. Then apply it to AuthorAdmin, PostAdmin, and PageAdmin in their respective apps.
>
> The mixin should:
> 1. Override get_queryset to filter by the user's owning Site (read from a UserProfile FK to Site that you should add to a new `people/models.py:UserProfile` model).
> 2. Override formfield_for_foreignkey so the `site` and `author` dropdowns only show rows from the user's Site.
> 3. Override autocomplete endpoints to enforce the same filter.
> 4. Bypass scoping for superusers.
>
> Add a management command `seed_groups` that creates the alexandra_admin and roam_editors groups with the right permissions, and creates two non-superuser demo accounts (alex_admin@example.com in alexandra_admin, roam_editor@example.com in roam_editors).
>
> Explain why each override is needed and what would leak through if it was missing.

**Verify.** Log into the admin as `roam_editor@example.com` and confirm zero alexandrapintea.eu Posts/Authors are visible in list views, search, or the Post.author dropdown. Log in as the superuser and confirm all content is visible. Tests for this come in 1.7.

### 1.5 DRF API endpoints

**Scope.** All six endpoints from architecture §4.2 (site-config, posts list/detail, authors list/detail, pages detail).

**Learning goal.** DRF ViewSets vs APIViews, serializers, query parameter handling, 404 with extra context (the available_languages hint).

**Prompt.**
> Implement the six DRF endpoints from architecture-v4.docx §4.2 in the `api/` app:
> - GET /api/site-config/ (returns the current Site's domain, theme, layout, enabled_languages, default_language)
> - GET /api/posts/ (list, filtered by current site and ?lang=, ordered by published_at desc, with pagination)
> - GET /api/posts/<slug>/ (detail, with the per-post language coverage rules from architecture §4.3)
> - GET /api/authors/
> - GET /api/authors/<slug>/ (with their posts on this site)
> - GET /api/pages/<slug>/
>
> Critical rules from §4.3:
> 1. ?lang=ro on a post that only has an EN translation must return 404, not the EN version.
> 2. The 404 body must include {"available_languages": ["en"]} so the frontend can render a useful message.
> 3. ?lang= values not in the site's enabled_languages are silently coerced to default_language.
>
> Configure django-cors-headers to allow only http://localhost:4000 (the SSR dev origin) in dev settings. Configure DRF pagination at 20 items per page.
>
> Explain how you implemented the 404-with-hint pattern (it's not the default DRF behavior).

**Verify.** Use httpie or curl to hit each endpoint manually. Confirm /api/posts/?lang=ro on alexandrapintea.eu excludes the English-only post. Confirm /api/posts/<english-only-slug>/?lang=ro returns 404 with `{"available_languages":["en"]}`.

### 1.6 pytest suite for backend

**Scope.** A real test suite covering Site middleware, SiteScopedAdmin, API filtering, and translation rules.

**Learning goal.** pytest-django fixtures, factory_boy or model_bakery for test data, parametrized tests, how to assert on admin behaviour.

**Prompt.**
> Build out the pytest suite in /backend/tests/ to cover the test targets listed in architecture-v4.docx §4.4. Use pytest-django and model_bakery (explain why model_bakery over factory_boy if you prefer it, or vice versa).
>
> Structure:
> - conftest.py with fixtures: `alex_site`, `roam_site`, `bilingual_post`, `english_only_post`, `alex_admin_user`, `roam_editor_user`.
> - test_site_middleware.py
> - test_admin_isolation.py (the crucial one — log in as roam_editor and assert zero leaks)
> - test_api_filtering.py (per-site filtering, ?lang= filtering)
> - test_api_language_coverage.py (404 + hint behaviour)
> - test_publishing_rule.py (is_published cannot be set without at least one enabled-language translation)
>
> Configure pytest.ini with proper test settings (in-memory SQLite is fine for tests; explain why or why not).
>
> Explain each test's intent and what it would catch.

**Verify.** `pytest -v` runs and all tests pass. Deliberately break SiteScopedAdmin (e.g., remove the `if not superuser` check) and confirm the isolation tests fail loudly.

### 1.7 GitHub Actions CI for backend

**Scope.** A minimal CI workflow that runs ruff + black + pytest on every PR.

**Learning goal.** YAML syntax for Actions, matrix builds (not needed here but worth knowing), service containers (Postgres in CI), caching.

**Prompt.**
> Add a GitHub Actions workflow at .github/workflows/backend-ci.yml that:
> 1. Triggers on push to main and on every pull request that touches backend/**.
> 2. Spins up a Postgres 16 service container with the same credentials our settings expect.
> 3. Installs Python 3.12, caches pip, installs requirements.
> 4. Runs `ruff check`, `black --check`, then `pytest` against the service container.
> 5. Fails the workflow if any step fails.
>
> Explain why we use a service container for Postgres instead of SQLite-in-memory for CI tests (hint: it should match prod).

**Verify.** Push a branch with a deliberate ruff violation and confirm CI fails. Fix it, confirm CI passes.

---

## Phase 2 — Frontend (week 2–3)

### 2.1 Angular SSR scaffold with standalone components

**Scope.** New Angular 18+ project with SSR enabled, standalone everywhere, ngx-translate wired, SCSS configured.

**Learning goal.** `ng new` flags, standalone bootstrapping (no AppModule), `provideRouter`, `provideClientHydration`, SSR via `provideServerRendering`.

**Prompt.**
> Scaffold the Angular project at /frontend. Use the latest stable Angular (currently 18+), with these flags/choices explicitly:
> - --standalone (default in 17+; just confirm it's on)
> - --routing (yes)
> - --style=scss
> - --ssr (yes — we need Angular SSR)
> - --strict (yes)
>
> After scaffold:
> 1. Confirm no NgModules exist in src/ — main.ts uses bootstrapApplication and the app providers come from app.config.ts.
> 2. Add @ngx-translate/core and @ngx-translate/http-loader. Configure it via providers in app.config.ts (not via NgModule).
> 3. Add SCSS variables file at src/styles/_variables.scss that defines fallback values for --bg, --fg, --accent, --font-body, --font-display (real values come from /api/site-config/, but having fallbacks prevents flash).
> 4. Set up an environments/ file with API_BASE_URL.
>
> Explain provideRouter, provideClientHydration, and provideServerRendering — what each does and why we need all three.

**Verify.** `ng serve` runs and the default app renders at http://localhost:4200. `ng build && node dist/.../server/main.js` runs the SSR server. `ng test` runs (will fail until 2.8; that's fine for now).

### 2.2 SignalStore for siteConfig

**Scope.** A SignalStore that fetches and caches /api/site-config/, exposes the theme as signals, and applies the theme as CSS variables on document root.

**Learning goal.** NgRx SignalStore (`signalStore`, `withState`, `withMethods`, `withComputed`), signal-first reactivity, how SignalStore differs from classic NgRx.

**Prompt.**
> Install @ngrx/signals. Build a SignalStore at /frontend/src/app/stores/site-config.store.ts that:
> 1. Holds the current site-config response in state.
> 2. Exposes a `loadSiteConfig()` method that fetches /api/site-config/ via HttpClient, with the X-Site-Domain header set from window.location.host (or the SSR equivalent — use inject(REQUEST) or similar on the server side).
> 3. Exposes computed signals: `theme()`, `layout()`, `enabledLanguages()`, `defaultLanguage()`.
> 4. Applies the theme by writing CSS custom properties to document.documentElement via signals.effect — but only when running in the browser (skip on the server).
>
> Wire the store as a provider in app.config.ts and call `loadSiteConfig()` in the root AppComponent's `ngOnInit`.
>
> Explain SignalStore versus classic NgRx — what withState/withMethods replace, and why this slice fits SignalStore.

**Verify.** Open localhost:4200 with the backend running. The page background should change colour to match the site's theme_config. Open DevTools and confirm `document.documentElement.style` has the CSS variables set.

### 2.3 SignalStore for language + ngx-translate integration

**Scope.** A second SignalStore for the active language, persisted to localStorage, integrated with ngx-translate.

**Learning goal.** Cross-store communication via signal.effect, localStorage persistence with SSR-safety, ngx-translate's `use()` method.

**Prompt.**
> Build a LanguageStore at /frontend/src/app/stores/language.store.ts using @ngrx/signals. It should:
> 1. Hold an `activeLanguage` signal, initialised from localStorage if present, otherwise from siteConfig.defaultLanguage.
> 2. Expose a `setLanguage(code)` method that updates state, writes to localStorage (browser only), and calls TranslateService.use(code).
> 3. Reject a setLanguage call if the code isn't in siteConfig.enabledLanguages — log a warning and ignore.
>
> Important SSR-safety details:
> - localStorage is undefined on the server. Use inject(PLATFORM_ID) and isPlatformBrowser to guard the access.
> - The initial language read on the server should come from a request header (Accept-Language or a cookie) — implement a basic version of this.
>
> Put a small <button> in AppComponent that toggles language between 'en' and 'ro' and confirms ngx-translate strings (use one demo string like `{{ 'nav.writings' | translate }}`) update in place.
>
> Explain why localStorage cannot be touched during SSR and what would break if you ignored that.

**Verify.** Click the toggle button; the demo string switches between English and Romanian. Refresh; the choice persists. View source on SSR'd HTML and confirm there are no `localStorage is not defined` errors in the server log.

### 2.4 Classic NgRx for the content slice

**Scope.** A classic NgRx slice for posts, authors, and pages, with @ngrx/entity, effects for HTTP, and selectors for cached navigation.

**Learning goal.** Actions, reducers, effects, selectors, @ngrx/entity adapter, the *why* of classic NgRx versus simpler patterns.

**Prompt.**
> Install @ngrx/store, @ngrx/effects, @ngrx/entity, @ngrx/store-devtools. Build a classic NgRx feature slice for content at /frontend/src/app/stores/content/:
> 1. content.actions.ts: loadPostList, loadPostListSuccess, loadPostListFailure, loadPostDetail (parameters: slug, lang), and equivalents for authors and pages.
> 2. content.reducer.ts: use @ngrx/entity's createEntityAdapter for the posts collection. Key by slug. Add a `loadedLangs` set so we don't re-fetch when we already have a post in the requested language.
> 3. content.effects.ts: HTTP calls via HttpClient, with proper error handling. Critical: a 404 with `available_languages` in the body is not a fatal error — it should dispatch a typed action `loadPostDetailNotInLanguage` carrying the slug + available languages, so the UI can render a useful fallback.
> 4. content.selectors.ts: selectPostList (filtered by current lang), selectPostBySlug, selectPostLoadState.
> 5. Wire providers in app.config.ts: provideStore, provideEffects, provideStoreDevtools.
>
> Explain the trade-off: this slice has 5 files and ~150 lines; the SignalStore equivalent would be ~30 lines. Why is classic NgRx the right call for content but not for siteConfig?

**Verify.** Hit `dispatch(loadPostList({ lang: 'en' }))` from a component or from the Redux DevTools. The store should populate. Re-dispatch with the same lang — confirm no second HTTP request fires (look at the Network tab and at the reducer's `loadedLangs` guard).

### 2.5 Routing per site (editorial vs. grid layout)

**Scope.** Standalone routes that select different top-level layout components based on `siteConfig.layout`.

**Learning goal.** Lazy-loaded standalone routes, layout component pattern, SSR-safe data resolution.

**Prompt.**
> Define the route tree in /frontend/src/app/app.routes.ts. Routes should be lazy-loaded standalone routes.
>
> Top-level structure:
> - / → conditionally renders EditorialLayoutComponent (for site.layout === 'editorial', i.e. alexandrapintea.eu) or GridLayoutComponent (for site.layout === 'grid', i.e. roamliterary.com). The selection happens via a wrapper component that reads `siteConfig.layout()` and *@switch*-renders the right layout.
> - /writings → posts list
> - /writings/:slug → post detail
> - /authors → authors list (relevant on Roam)
> - /authors/:slug → author detail
> - /about, /contact → pages
>
> Each route component should be standalone with its imports declared inline.
>
> Resolve data via the new functional resolvers (CanActivateFn-style), not class-based Resolve services — explain why the new pattern is preferred.

**Verify.** Visit http://alexandrapintea.local:4200 (with hosts file pointing at 127.0.0.1) and confirm the editorial layout renders. Visit http://roamliterary.local:4200 and confirm the grid layout renders. Both load the right site-config.

### 2.6 EN/RO toggle with monolingual-post handling

**Scope.** The toggle component in the top nav, with the dimming and aria-label behaviour from requirements §3.4 and architecture §4.3.

**Learning goal.** Component-level signals, computed signals based on store signals, accessibility (aria-label, aria-disabled).

**Prompt.**
> Build a LanguageToggleComponent at /frontend/src/app/components/language-toggle/. It should:
> 1. Read `enabledLanguages()` from siteConfig store. If only one language is enabled, render nothing.
> 2. Read `activeLanguage()` from the language store. The active language's button has an `aria-current="true"` and is visually underlined.
> 3. If the current route is a post detail and the loaded post's available_languages does not include the other language, the other-language button is rendered with aria-disabled="true" and a tooltip ("This piece is only available in English." / Romanian equivalent). Clicking it does nothing.
> 4. On the writings list, no dimming — clicking changes the active language and the list re-filters via the content store.
>
> The component should use signals throughout for change detection. Avoid OnPush boilerplate — standalone + signals get you fine-grained reactivity for free.

**Verify.** Manually walk the four states from architecture §4.3: bilingual post (both active), English-only post viewed in EN (RO dimmed), English-only post viewed in RO (404 with hint UI), writings list (no dimming). The aria attributes are correct in each state.

### 2.7 Open Graph metadata via Angular SSR

**Scope.** Per-route meta tags populated from API data during SSR.

**Learning goal.** Angular's Meta and Title services, how they interact with SSR, why this is the entire point of SSR for this project.

**Prompt.**
> For each public route (writings list, post detail, author detail, about, contact), set <title> and Open Graph + Twitter Card meta tags during SSR. Use Angular's Title and Meta services from @angular/platform-browser. Setting them in the route's component ngOnInit works — SSR captures the resulting head.
>
> Tags to set, populated from the loaded data:
> - og:title, og:description, og:image, og:url, og:site_name, og:type
> - twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image
> - canonical link
>
> The post detail page is the highest-stakes case — when shared on Slack/WhatsApp, the unfurl must include the cover image and excerpt.
>
> Add a Playwright e2e in 2.9 to confirm the SSR'd HTML contains the right meta tags before the JS hydrates.

**Verify.** Run `curl http://localhost:4000/writings/some-essay` and grep the response for `og:title`. It should be populated from the post, not empty. Paste a URL into Slack (use ngrok or a real staging URL) and confirm the preview renders.

### 2.8 Jest unit-test setup

**Scope.** Replace the default Karma + Jasmine with Jest. Add unit tests for both stores and a couple of components.

**Learning goal.** jest-preset-angular, testing standalone components, testing SignalStore and classic NgRx, mocking HttpClient.

**Prompt.**
> Replace Karma + Jasmine with Jest in the /frontend project. Use jest-preset-angular. Steps:
> 1. Uninstall karma packages. Install jest, jest-preset-angular, @types/jest.
> 2. Add jest.config.ts with the preset; configure setupFiles for zone.js/testing.
> 3. Update angular.json so `ng test` runs Jest (or add an npm script `test`).
> 4. Write tests:
>    - site-config.store.spec.ts: assert that loadSiteConfig() dispatches the HTTP call with the X-Site-Domain header, and that the theme signal updates after a successful response.
>    - language.store.spec.ts: assert that setLanguage rejects unsupported codes and persists to localStorage.
>    - content.reducer.spec.ts: assert that loadPostListSuccess populates the entity adapter; loadPostDetailNotInLanguage stores the available_languages hint.
>    - content.effects.spec.ts: use marble testing (or jest-mock-axios) to assert that the 404-with-hint case dispatches loadPostDetailNotInLanguage, not loadPostDetailFailure.
>    - language-toggle.component.spec.ts: assert aria attributes across the four states from 2.6.
>
> Explain Jest vs Karma for Angular — what changes in practice and what stays the same.

**Verify.** `npm run test` runs and all tests pass. Coverage is reported at the end of the run.

### 2.9 Playwright e2e setup

**Scope.** Playwright wired into the project, smoke tests for the critical flows.

**Learning goal.** Playwright project config, fixtures, baseURL, running against a Docker compose stack, why Playwright > Cypress for Angular SSR.

**Prompt.**
> Install Playwright in /frontend (npm init playwright@latest -- --ct=false). Configure playwright.config.ts to:
> 1. Run against http://alexandrapintea.local:4000 and http://roamliterary.local:4000 (with /etc/hosts entries for local dev — document this in the README).
> 2. Use a `webServer` block to start `npm run serve:ssr` before tests if not already running.
> 3. Generate HTML report on failure; trace on retry.
>
> Tests in /frontend/e2e/:
> - smoke.spec.ts: visit / on each domain; assert correct theme is applied (computed background colour) and correct meta tags are in the SSR'd HTML.
> - language-toggle.spec.ts: visit /writings/<bilingual-slug> on alexandrapintea, assert toggle works in place, assert URL doesn't change.
> - monolingual-post.spec.ts: visit /writings/<english-only-slug> in RO, assert the 404-with-fallback UI renders.
> - deep-link.spec.ts: directly request /writings/<slug> with curl-equivalent (Playwright's apiRequest) and assert the SSR'd HTML contains the post body and OG meta — i.e. content is server-rendered, not just hydrated client-side.
>
> Explain why these are e2e and not unit tests — what would unit tests miss?

**Verify.** `npx playwright test` runs and all pass. Break SSR (e.g. throw in a resolver) and confirm deep-link.spec.ts fails loudly.

### 2.10 Frontend CI workflow

**Scope.** Extend the GitHub Actions setup to lint + Jest on every PR; Playwright on nightly schedule.

**Learning goal.** Multi-job workflows, conditional triggers, scheduled workflows.

**Prompt.**
> Add a workflow at .github/workflows/frontend-ci.yml that:
> 1. Triggers on push/PR touching frontend/**.
> 2. Job `lint-and-test`: install Node 22, cache npm, run `npm ci`, then `npm run lint` and `npm run test -- --coverage`.
> 3. Triggers on `schedule: cron: '0 3 * * *'` (3am UTC): job `e2e` runs the Playwright suite.
>
> Explain why we don't run Playwright on every PR (cost, runtime, flakiness) and what the trade-off is.

**Verify.** PR with a lint violation fails CI. PR with a unit test failure fails CI. Manually trigger the e2e job and confirm it runs.

---

## Phase 3 — Dockerize (3–5 days)

### 3.1 Backend Dockerfile

**Scope.** A multi-stage Dockerfile for Django + Gunicorn, runs as a non-root user.

**Learning goal.** Multi-stage builds, layer caching, pinning Python base image, COPY ordering, USER directive.

**Prompt.**
> Write /backend/Dockerfile as a multi-stage build:
> - Stage 1 (builder): python:3.12-slim base; install build deps, copy pyproject.toml first to leverage layer caching, install with pip.
> - Stage 2 (runtime): python:3.12-slim base; copy site-packages from builder; copy app code; create non-root user `app`; entrypoint script runs migrations then exec's gunicorn.
> - Health check via HTTP GET /api/site-config/ (200 OK).
>
> Bonus: explain `--no-cache-dir`, why we copy requirements before code, why we exec gunicorn (not just `gunicorn ...` — what's the PID 1 implication).

**Verify.** `docker build -t backend ./backend` succeeds. `docker run -e DATABASE_URL=... backend` starts Gunicorn and serves /api/site-config/ (against a separately running Postgres).

### 3.2 Frontend Dockerfile

**Scope.** A multi-stage Dockerfile for Angular SSR. Build stage produces the bundle; runtime stage runs Node SSR.

**Learning goal.** Multi-stage with Node base, why we don't ship the build toolchain to prod, NODE_ENV, --max-old-space-size.

**Prompt.**
> Write /frontend/Dockerfile as a multi-stage build:
> - Stage 1 (builder): node:22-alpine; copy package.json first; `npm ci`; copy source; `npm run build` (which produces dist/<app>/server/main.js).
> - Stage 2 (runtime): node:22-alpine; copy only the dist folder from builder; create non-root user; CMD ["node", "--max-old-space-size=512", "dist/<app>/server/main.js"].
> - Expose 4000.
>
> Explain why we run the SSR build with --max-old-space-size=512 (per architecture §9 risk row on the 4GB VPS) and what would happen without it.

**Verify.** `docker build -t frontend ./frontend` succeeds. Image size is reasonable (alpine base; should be well under 200MB). `docker run` runs the SSR server.

### 3.3 docker-compose.yml (development)

**Scope.** Three services with source mounts and hot reload.

**Learning goal.** Bind mounts, port publishing, depends_on with healthcheck, env_file vs environment.

**Prompt.**
> Write /docker-compose.yml at the repo root for **development**:
> - postgres service (image: postgres:16-alpine, named volume pgdata, exposed on host 5432).
> - backend service (build context: ./backend, source bind-mounted at /app, command override: `python manage.py runserver 0.0.0.0:8000`, exposed on 8000, depends_on postgres with healthcheck).
> - frontend service (build context: ./frontend, source bind-mounted at /app, command override: `ng serve --host 0.0.0.0`, exposed on 4200; SSR is *not* used in dev — explain why).
>
> Env vars from a .env file at the repo root (gitignored; provide a .env.example checked in).
>
> Explain the dev/prod differences (no SSR in dev, source mounts, dev secrets, exposed Postgres port).

**Verify.** `docker compose up` brings all three services up. http://localhost:4200 hot-reloads on frontend source edits. Backend `runserver` reloads on Python edits. Postgres is reachable from a local DB GUI.

### 3.4 docker-compose.prod.yml

**Scope.** The production compose file from architecture §6.1.

**Learning goal.** No source mounts, no published Postgres port, image tags, restart policies, named volumes.

**Prompt.**
> Write /docker-compose.prod.yml for **production**:
> - Same three services, no source mounts, no Postgres host port.
> - Restart policy: unless-stopped on all three.
> - Frontend runs SSR (the Dockerfile's CMD), not ng serve.
> - Env vars from a .env file with prod credentials (not committed).
> - Named volumes: pgdata for Postgres, media for /app/media on backend.
> - Both backend and frontend listen on the internal network only; nginx (on host) reverse-proxies to them via host loopback (e.g., publish backend on 127.0.0.1:8000, frontend on 127.0.0.1:4000).
>
> Explain why we publish to 127.0.0.1:<port> instead of just 0.0.0.0:<port> in prod.

**Verify.** `docker compose -f docker-compose.prod.yml up --build` runs locally. http://localhost:4000 returns SSR'd HTML. http://localhost:8000/api/site-config/ returns JSON. Postgres is not reachable from outside the compose network.

---

## Phase 4 — VPS provisioning (3–5 days)

### 4.1 Hetzner CX22 provisioning

**Scope.** Provision the VPS, pick the right options, add SSH key.

**Learning goal.** Hetzner Cloud UI, choosing a datacenter, adding SSH keys, snapshot vs backup settings.

**Prompt.**
> I'm about to provision a Hetzner CX22 VPS with Ubuntu 24.04 LTS. Walk me through:
> 1. Generating an ed25519 SSH key on Windows (ssh-keygen or via WSL) and adding the public key to Hetzner.
> 2. Choosing between Falkenstein and Helsinki — what are the differences (latency to EU, redundancy).
> 3. Enabling automated backups vs. snapshots — when each fires, what they cost, what they protect.
> 4. The first SSH connection — disabling password auth, testing key-only auth.
>
> Do not run any commands yet — just give me the checklist.

**Verify.** You can SSH into the VPS as root with your key, and password auth is disabled.

### 4.2 Server hardening

**Scope.** Non-root user, ufw, fail2ban, automatic security updates.

**Learning goal.** Linux user/group fundamentals, SSH hardening, ufw, fail2ban basics, unattended-upgrades.

**Prompt.**
> SSH'd into the VPS as root. Walk me through hardening, command by command, explaining each:
> 1. Create a non-root deploy user (`deploy`) in the sudo group; copy authorized_keys; test SSH as deploy.
> 2. Disable root login over SSH; disable password authentication entirely; restart sshd; **test from a second terminal before exiting the first**.
> 3. Configure ufw to allow only 22, 80, 443 inbound; deny everything else; enable; verify status.
> 4. Install fail2ban with default sshd jail; verify it's watching auth.log.
> 5. Enable unattended-upgrades for security patches only; verify.
>
> For each step, tell me what to verify and what failure mode I should be looking out for.

**Verify.** Walk the checklist. The most important verification: open a *second* SSH session as `deploy` before closing your root session; if it works, close root.

### 4.3 Docker + nginx + certbot install

**Scope.** Install Docker (official repo), nginx, certbot. No reverse-proxy config yet.

**Learning goal.** apt sources, why we use upstream Docker repo over Ubuntu's, certbot's two install options.

**Prompt.**
> On the Hetzner VPS (now running as user `deploy`), walk me through installing:
> 1. Docker Engine + Docker Compose plugin from Docker's upstream apt repo (not Ubuntu's `docker.io`). Explain why upstream.
> 2. Add `deploy` to the docker group; test with `docker run hello-world` (without sudo).
> 3. nginx from Ubuntu's repo (this one is fine since nginx is conservative).
> 4. certbot via snap (the Let's Encrypt-recommended path) or via apt (also fine but older). Pick one and explain the trade-off.
>
> Verify each install.

**Verify.** `docker run hello-world` succeeds as `deploy`. `nginx -v` and `certbot --version` work.

### 4.4 nginx reverse-proxy + TLS

**Scope.** The nginx config from architecture §6.3 — TLS termination, Host header routing, /api/ and /admin/ to backend.

**Learning goal.** nginx server blocks, ssl_certificate, proxy_pass, proxy_set_header (especially Host and X-Forwarded-*), `location` ordering.

**Prompt.**
> On the VPS, write the nginx config files for both domains. Two server blocks per domain (port 80 redirects to 443; port 443 serves the app). The cert is from Let's Encrypt; for now leave the ssl_certificate lines commented out — we'll add them after running certbot.
>
> Both domains route as follows:
> - `/api/` → http://127.0.0.1:8000 (the backend container)
> - `/admin/` → http://127.0.0.1:8000 (also the backend container, but it's worth a separate `location` block so the cookie scope is right)
> - Everything else → http://127.0.0.1:4000 (the SSR frontend container)
>
> All proxy_pass directives must preserve the original Host header (so the Django Site middleware resolves correctly) and forward X-Forwarded-Proto and X-Forwarded-For.
>
> Then walk me through:
> 1. nginx -t to validate config.
> 2. systemctl reload nginx.
> 3. Pointing DNS A records at the VPS IP (instructions for the registrars I'll use).
> 4. Running certbot --nginx -d alexandrapintea.eu -d www.alexandrapintea.eu -d roamliterary.com -d www.roamliterary.com and confirming it patches the nginx configs with the cert paths.
> 5. Verifying HTTPS works on both domains (well, with a stub backend — the real stack comes in Phase 5).
>
> Explain why the Host header preservation is non-negotiable for our multi-tenant setup.

**Verify.** `curl -I https://alexandrapintea.eu` returns 200 (or 502 if the backend isn't up — that's expected). `curl -I http://alexandrapintea.eu` returns a 301 to https://. SSL Labs grade is at least A.

### 4.5 Off-site backup setup

**Scope.** A nightly cron that pg_dumps the Postgres container and rclone's the dump to Backblaze B2 (or Hetzner Object Storage).

**Learning goal.** cron, rclone configuration, B2 application keys, retention policy.

**Prompt.**
> Set up off-site backups per architecture §7.4. On the VPS:
> 1. Install rclone. Configure it for Backblaze B2 (or Hetzner Object Storage — pick one and explain the trade-off in price/latency/lock-in). The B2 application key should have write-only access to a single bucket — I should not be able to read other buckets or delete things outside the retention policy.
> 2. Write /opt/backups/pg_dump.sh that runs pg_dump inside the postgres container (via docker exec) and writes to /var/backups/pg/YYYY-MM-DD.sql.gz.
> 3. Write /opt/backups/sync.sh that runs `rclone sync /var/backups/pg b2:bucket-name/pg --backup-dir b2:bucket-name/pg-trash/<date>`.
> 4. Add a cron entry that runs both nightly at 03:30 UTC.
> 5. Rotation: keep 7 daily local; 4 weekly local; 3 monthly local. Keep all on B2 with B2 Object Lock or a lifecycle rule trimming after 90 days.
>
> Walk me through testing the restore path: download a dump from B2 to a fresh Postgres container locally and verify it loads.

**Verify.** Run the scripts manually. Confirm a dump file appears in B2. Run the restore drill against a throwaway local Postgres container — it should load the dump and the demo content should be queryable.

---

## Phase 5 — First deploy (1 day)

### 5.1 First production deploy

**Scope.** Clone the repo into /opt/app on the VPS, set production env vars, run `docker compose -f docker-compose.prod.yml up -d --build`, smoke-test.

**Learning goal.** Bringing every piece together; what fails first; how to read container logs in anger.

**Prompt.**
> First production deploy. SSH into the VPS as `deploy` and walk me through:
> 1. git clone the repo into /opt/app. Set permissions so `deploy` owns it.
> 2. Create /opt/app/.env with production values: SECRET_KEY (generate fresh; *never* reuse dev SECRET_KEY), DATABASE_URL pointing at the postgres container, DJANGO_DEBUG=False, ALLOWED_HOSTS=alexandrapintea.eu,www.alexandrapintea.eu,roamliterary.com,www.roamliterary.com, SENTRY_DSN, etc.
> 3. `docker compose -f docker-compose.prod.yml build` then `up -d`. Watch `docker compose logs -f` for the first ~30 seconds.
> 4. If everything is up: hit the API directly via `curl http://127.0.0.1:8000/api/site-config/` (with X-Site-Domain header). Then hit nginx via `curl -k https://alexandrapintea.eu/`. Then real browser.
> 5. Run the recovery drill: download last night's dump from B2, restore to a *staging* Postgres container, point a staging compose stack at it, verify content renders. Document the recovery time.
>
> Common failures to expect and how to diagnose: container restarting on boot (logs show migration failure), 502 from nginx (backend not bound to 127.0.0.1 or wrong port), DNS not yet propagated.

**Verify.** Both domains serve correctly over HTTPS. The admin is reachable at /admin/. The smoke flows from Playwright 2.9 work against the production URLs.

---

## Phase 6 — Content migration and cutover (1 day)

### 6.1 Squarespace content migration

**Scope.** Pull existing post and author content from Squarespace, transform, load into the new admin.

**Learning goal.** Squarespace's export options (which are limited), data transformation, idempotent imports.

**Prompt.**
> Squarespace's export is XML (WordPress format) and incomplete — it tends to miss images and certain block types. Walk me through:
> 1. Exporting both Squarespace sites and triaging what's in the XML vs. what we need to copy manually.
> 2. Writing a Django management command `import_squarespace` that takes an XML file path and a target Site, parses posts/authors/pages, downloads images into the media volume, creates the corresponding parler translations (English only for now; Romanian content I'll add manually in the admin).
> 3. Running the import against staging (point a temporary subdomain like staging.alexandrapintea.eu at the VPS, or use --override-host in the import to set the Site).
> 4. A manual QA pass: walk every imported post and confirm body, excerpt, cover image, and date all transferred.
>
> Explain the idempotency strategy — re-running the import should not duplicate posts.

**Verify.** Imported content renders on the staging subdomain correctly. Re-running the import is a no-op.

### 6.2 Cutover

**Scope.** Final DNS switch from Squarespace to the VPS; cancel Squarespace subscriptions after stability window.

**Learning goal.** DNS TTL, cutover risk, when to cancel.

**Prompt.**
> Cutover plan. Walk me through:
> 1. 24h before: lower the DNS TTL at the registrar to 300s for both domains.
> 2. Cutover hour: change the A records at the registrar from Squarespace's IPs to the Hetzner VPS IP. Watch the propagation with `dig +short alexandrapintea.eu` from a few global resolvers.
> 3. The 48-hour stability window: monitor Sentry for any spike in 5xx; monitor UptimeRobot; watch nginx access.log for unusual traffic.
> 4. After 48h with no issues: cancel Squarespace subscriptions for both sites.
> 5. If anything goes wrong during the window: rollback plan is to re-point DNS back to Squarespace (Squarespace will still be serving until cancellation).

**Verify.** Both domains resolve to the VPS. Site is fully functional. Sentry quiet. Squarespace cancelled and confirmation email saved.

---

## Phase 7 (post-launch, optional) — CD

### 7.1 GitHub Actions CD on release tag

**Scope.** Extend CI with a release-tag-triggered build + push + SSH-deploy.

**Learning goal.** GitHub Container Registry (GHCR), SSH from GitHub Actions, image tag conventions.

**Prompt.**
> Add a deploy workflow at .github/workflows/deploy.yml that triggers on tag push matching `v*`. Steps:
> 1. Build backend and frontend images, tag with the release tag and `latest`, push to ghcr.io.
> 2. SSH into the VPS via an ssh-action; run `cd /opt/app && docker compose pull && docker compose up -d`.
> 3. Run a post-deploy health check (curl /api/site-config/).
>
> Secrets needed: GHCR_TOKEN, VPS_HOST, VPS_USER, VPS_SSH_KEY. Walk me through generating each and adding them to the GitHub repo settings.
>
> Explain the rollback strategy: a previous tag's image hash is always available, so `docker compose -f ... up -d` with the old tag instantly rolls back.

**Verify.** Tag a release, push, watch the workflow. The deployed version's `/api/site-config/` includes a build-tag field (you'll need to add that to the response).

---

## Phase 8 (future) — Subscriptions

Out of scope for this playbook. When you get there, the architecture document §8 lists the four extension points (auth, paywall, Stripe, per-author publishing). At that point, write a new playbook section the same way this one is structured.

---

## Working style notes

A few patterns that pay off across the whole project:

**One concept per prompt.** If you find yourself asking Claude Code for "the model, the admin, and the API", split it into three prompts. You'll catch more issues per step and learn more.

**Ask for the failure mode before accepting the code.** "What would break if a request came in with an unknown Host header?" is a better question than "looks good, next?". The answer often reveals an edge case the code didn't handle.

**Keep claude-code-playbook.md open in a tab.** Edit it as you go — if a prompt didn't work, write down what *did* work. This file becomes your project's logbook.

**When stuck, downscope.** If Claude Code keeps producing broken code for a complex prompt, the prompt is too big. Strip it down to the smallest version of the same idea that could possibly work, get *that* green, then iterate up.

**Don't merge what you don't understand.** Especially in Phase 4 (VPS) — running a command you don't understand on your own server is how you end up with a broken VPS at 2am. If a command in a Phase 4 prompt is opaque, ask Claude Code to explain it before running.
