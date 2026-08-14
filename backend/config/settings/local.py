from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Dev-only browser origins. 4200 is `ng serve`, which calls the API directly;
# 4000 is the SSR dev server. In production the browser never reaches Django,
# so base.py trusts nothing unless CORS_ALLOWED_ORIGINS is set explicitly.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:4200",
    "http://localhost:4000",
]
