# multi-tenant-writing

A multi-tenant rebuild of [alexandrapintea.eu](https://alexandrapintea.eu) and [roamliterary.com](https://roamliterary.com) on a shared Django + Angular SSR + Docker stack.

## Structure

| Folder | Purpose |
|--------|---------|
| `backend/` | Django project — REST API, multi-tenant data layer, auth |
| `frontend/` | Angular SSR app — shared codebase, per-tenant theming |
| `docs/` | Architecture decisions, runbooks, and project documentation |
