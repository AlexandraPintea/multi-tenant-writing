from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Dev-only browser origins. 4200 is `ng serve`, which calls the API directly;
# 4000 is the SSR dev server. In production the browser never reaches Django,
# so base.py trusts nothing unless CORS_ALLOWED_ORIGINS is set explicitly.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:4200",
    "http://localhost:4000",
    # The e2e tenant proxy (frontend/e2e/tenant-proxy.mjs). Without these the
    # browser can render the first page — that HTML is server-rendered — and
    # then every client-side fetch after a language switch fails CORS, which
    # looks exactly like "the toggle does nothing".
    "http://localhost:4101",
    "http://localhost:4102",
]
