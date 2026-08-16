"""Settings for the deployed site, behind nginx on the Hetzner VPS.

Everything here assumes the topology in architecture §6.3: nginx terminates TLS
on the host, proxies /api/ and /admin/ to this process over loopback, serves
/static/ and /media/ from disk itself, and sends everything else to the SSR
container. Django never faces the internet directly and never speaks TLS.
"""

from decouple import Csv, config

from .base import *  # noqa: F401, F403

DEBUG = False

# No default: an unset ALLOWED_HOSTS in production is a misconfiguration that
# should stop the container at import, not silently serve every Host header.
ALLOWED_HOSTS = config("ALLOWED_HOSTS", cast=Csv())

# Needs the scheme, unlike ALLOWED_HOSTS. Django compares this against the
# Origin header on unsafe requests, and the admin is the only thing here that
# posts a form, so getting it wrong locks the site's owner out of her own admin
# with "CSRF verification failed" and nothing else to go on.
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", cast=Csv())

# nginx terminates TLS, so every request reaches Django over plain HTTP on
# loopback and request.is_secure() is False without this. That single value
# decides three things at once: whether SECURE_SSL_REDIRECT loops forever
# (Django redirects to https, nginx forwards http again, repeat), whether the
# secure cookies below are ever set, and whether HSTS is emitted at all.
#
# Safe here only because nginx *overwrites* X-Forwarded-Proto rather than
# passing a client-supplied one through. If Django is ever exposed directly,
# this line becomes a spoofable claim of "I was secure" and must go.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# One hour to start. HSTS is a promise the browser caches and honours even when
# the site is broken, so a long max-age set before TLS is proven stable locks
# visitors out of a site that cannot be reached any other way. Raise to a year
# (31536000) after a week of clean HTTPS, then consider preload.
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=3600, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# Both of these are deliberate refusals, so they are silenced rather than left
# to be re-reported on every deploy check:
#
# W005 asks for includeSubDomains. Nothing runs on a subdomain today, and a
# staging.alexandrapintea.eu brought up over plain HTTP while learning would be
# unreachable in the browser if the parent domain had already promised HTTPS
# for everything beneath it. Revisit once the setup is settled.
#
# W021 asks for preload. Preloading ships the domain inside browser binaries
# and takes months to undo — it is not a setting, it is a commitment, and it
# needs a year-long max-age and a submission we have not made.
SILENCED_SYSTEM_CHECKS = ["security.W005", "security.W021"]

# The throttle counters for the comment and contact endpoints live in the
# default cache. base.py notes the problem this fixes: with no CACHES, Django
# falls back to per-process LocMemCache, so under gunicorn with N workers the
# advertised 5/hour becomes N x 5/hour and a restart forgets every count.
# DatabaseCache is shared and durable, and adds no dependency — the price is a
# table, created by `manage.py createcachetable` in the entrypoint.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# The browser and the API share an origin in production — nginx puts them both
# behind one domain — so no cross-origin request is ever made and nothing needs
# to be trusted. Left explicit rather than inherited, because base.py reads an
# environment variable and a stray value in the server's .env would otherwise
# open the API to a foreign origin without anyone editing code.
CORS_ALLOWED_ORIGINS = []

# collectstatic writes here in the entrypoint; the same path is bind-mounted to
# the host so nginx can serve /static/ without going through Django. Only the
# admin's own CSS and JS live here — the Angular bundle is the SSR container's.
STATIC_ROOT = config("STATIC_ROOT", default=BASE_DIR / "staticfiles")  # noqa: F405
MEDIA_ROOT = config("MEDIA_ROOT", default=BASE_DIR / "media")  # noqa: F405

# Everything to stdout, where `docker compose logs` can see it. Django's default
# only mails admins on 500s and there is no mail configured, so without this a
# production traceback goes nowhere at all.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{asctime} {levelname} {name} {message}",
            "style": "{",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        # 4xx and 5xx responses, which are otherwise silent at INFO.
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
