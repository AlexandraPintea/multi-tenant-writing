from pathlib import Path

import dj_database_url
from decouple import Csv, config

# backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "parler",
    "rest_framework",
    "corsheaders",
    # project apps
    "sites_core.apps.SitesCoreConfig",
    "content.apps.ContentConfig",
    "people.apps.PeopleConfig",
    "api.apps.ApiConfig",
    "admin_scoped.apps.AdminScopedConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CorsMiddleware must sit as high as possible — before any middleware that
    # can generate a response (CommonMiddleware) — so CORS headers are added to
    # those early responses too.
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # SiteMiddleware runs after CommonMiddleware (which validates Host against
    # ALLOWED_HOSTS) and after auth, so request.site and request.user are both
    # available to views and the admin. It has no CSRF/session dependency.
    "sites_core.middleware.SiteMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.parse(
        config("DATABASE_URL"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

_PASSWORD_VALIDATION = "django.contrib.auth.password_validation"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": f"{_PASSWORD_VALIDATION}.UserAttributeSimilarityValidator"},
    {"NAME": f"{_PASSWORD_VALIDATION}.MinimumLengthValidator"},
    {"NAME": f"{_PASSWORD_VALIDATION}.CommonPasswordValidator"},
    {"NAME": f"{_PASSWORD_VALIDATION}.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("en", "English"),
    ("ro", "Romanian"),
]

# django-parler: None key = fallback for all sites (we don't use django.contrib.sites)
PARLER_LANGUAGES = {
    None: (
        {"code": "en"},
        {"code": "ro"},
    ),
    "default": {
        "fallback": "en",
        "hide_untranslated": False,
    },
}

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Site resolved by sites_core.middleware.SiteMiddleware for unknown hosts
# (localhost, health checks, the VPS IP). Configurable per environment.
DEFAULT_SITE_DOMAIN = config("DEFAULT_SITE_DOMAIN", default="alexandrapintea.eu")

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

# CORS: no origin is trusted by default. Development adds its own in
# settings/local.py; production must name the SSR container's origin explicitly
# via the environment (architecture §7.1).
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
