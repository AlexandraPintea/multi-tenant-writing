from django.conf import settings
from django.utils.functional import SimpleLazyObject

from .models import Site


def _resolve_site(domain):
    """Resolve a host/domain string to an active Site row.

    Unknown hosts (e.g. ``localhost``, health checks, the VPS IP) fall back to
    ``settings.DEFAULT_SITE_DOMAIN`` so local dev and probes still get a Site.
    Returns ``None`` only if the configured default itself is missing.
    """
    site = Site.objects.filter(domain=domain, is_active=True).first()
    if site is None:
        site = Site.objects.filter(
            domain=settings.DEFAULT_SITE_DOMAIN, is_active=True
        ).first()
    return site


class SiteMiddleware:
    """Attach the current :class:`Site` to ``request.site``.

    The domain is taken from the ``X-Site-Domain`` header when present (the SSR
    layer forwards the browser's Host this way) and otherwise from
    ``request.get_host()``. Resolution is wrapped in a ``SimpleLazyObject`` so
    the DB query only runs if a view actually reads ``request.site`` — admin and
    static requests pay nothing.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw = request.headers.get("X-Site-Domain") or request.get_host()
        domain = raw.split(":")[0].lower()  # drop any :port, normalise case
        request.site = SimpleLazyObject(lambda: _resolve_site(domain))
        return self.get_response(request)