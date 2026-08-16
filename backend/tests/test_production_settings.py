"""The production settings module, checked the way a deployment is checked.

These run under the local settings like every other test, so the module is
imported by hand and its values pushed through override_settings. That is the
point: nothing else in the suite ever loads config.settings.production, so a
typo in it would otherwise surface for the first time on the server, as a
container that will not start.
"""

import importlib

import pytest
from django.core.checks import Tags, run_checks
from django.test import override_settings

# Long, varied, and not prefixed with django-insecure — otherwise security.W009
# fires and the deployment check below can never come back clean.
STRONG_SECRET_KEY = "8fZq2vR7pLx4mKw9TnB6cH3jY5sD1gQaVeUiOoPzXcVbNmAsDfGh"

# The names the security checks actually read. Overriding the whole module
# would drag INSTALLED_APPS through the app registry for no benefit.
CHECKED_SETTINGS = [
    "DEBUG",
    "ALLOWED_HOSTS",
    "CSRF_TRUSTED_ORIGINS",
    "SECURE_SSL_REDIRECT",
    "SECURE_PROXY_SSL_HEADER",
    "SECURE_HSTS_SECONDS",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "SECURE_HSTS_PRELOAD",
    "SESSION_COOKIE_SECURE",
    "CSRF_COOKIE_SECURE",
    "SILENCED_SYSTEM_CHECKS",
]


@pytest.fixture
def production(monkeypatch):
    """The production module, imported with the environment the VPS provides.

    ALLOWED_HOSTS and CSRF_TRUSTED_ORIGINS have no defaults on purpose, so the
    import fails without them — which is the behaviour being relied on here.
    """
    monkeypatch.setenv("ALLOWED_HOSTS", "alexandrapintea.eu,www.alexandrapintea.eu")
    monkeypatch.setenv(
        "CSRF_TRUSTED_ORIGINS",
        "https://alexandrapintea.eu,https://www.alexandrapintea.eu",
    )
    return importlib.reload(importlib.import_module("config.settings.production"))


def test_deploy_checks_are_clean(production):
    overrides = {name: getattr(production, name) for name in CHECKED_SETTINGS}
    silenced = overrides["SILENCED_SYSTEM_CHECKS"]

    with override_settings(SECRET_KEY=STRONG_SECRET_KEY, **overrides):
        issues = run_checks(tags=[Tags.security], include_deployment_checks=True)

    remaining = [issue.id for issue in issues if issue.id not in silenced]
    assert remaining == []


def test_hardening_is_on(production):
    assert production.DEBUG is False
    assert production.SESSION_COOKIE_SECURE is True
    assert production.CSRF_COOKIE_SECURE is True
    assert production.SECURE_SSL_REDIRECT is True
    assert production.SECURE_HSTS_SECONDS > 0
    # Without this Django sees plain HTTP behind nginx, and then the redirect
    # above bounces forever and the secure cookies are never set.
    assert production.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")


def test_allowed_hosts_and_csrf_origins_come_from_the_environment(production):
    assert production.ALLOWED_HOSTS == ["alexandrapintea.eu", "www.alexandrapintea.eu"]
    # Scheme included: Django compares these against the Origin header, and a
    # bare hostname here silently fails every admin login form.
    assert all(
        origin.startswith("https://") for origin in production.CSRF_TRUSTED_ORIGINS
    )


def test_throttle_counters_are_shared_across_workers(production):
    # LocMemCache is per process, so gunicorn with N workers would hand out
    # N x the advertised comment and contact rates.
    assert production.CACHES["default"]["BACKEND"].endswith("db.DatabaseCache")


def test_no_cors_origin_is_trusted(production):
    # Browser and API share an origin behind nginx, so nothing is cross-origin.
    assert production.CORS_ALLOWED_ORIGINS == []
