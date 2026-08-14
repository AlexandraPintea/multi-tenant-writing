"""SiteMiddleware — the three resolution paths from playbook 1.3.

Backfilled: 1.3 shipped without tests, so the fallback path had never been
exercised. The middleware is the single point where a request becomes a tenant,
so a bug here mis-serves an entire site rather than one view.
"""

import pytest
from django.test import RequestFactory

from sites_core.middleware import SiteMiddleware


def resolve(**request_kwargs):
    """Run the middleware over a bare request and return the attached Site."""
    request = RequestFactory().get("/", **request_kwargs)
    resolved = {}

    def get_response(req):
        # Touch request.site inside the view, since it is a SimpleLazyObject
        # and the query is deliberately deferred until something reads it.
        resolved["site"] = req.site
        return "response"

    SiteMiddleware(get_response)(request)
    return resolved["site"]


@pytest.mark.django_db
def test_known_host_resolves_to_its_site(alex_site, roam_site):
    assert resolve(headers={"host": "roamliterary.com"}).pk == roam_site.pk


@pytest.mark.django_db
def test_x_site_domain_header_wins_over_host(alex_site, roam_site):
    """SSR forwards the browser's Host this way, so it must take precedence."""
    site = resolve(
        headers={"host": "alexandrapintea.eu", "x-site-domain": "roamliterary.com"}
    )
    assert site.pk == roam_site.pk


@pytest.mark.django_db
def test_unknown_host_falls_back_to_the_default_site(alex_site, roam_site):
    """Health checks, the raw VPS IP and localhost must still get a Site.

    settings.DEFAULT_SITE_DOMAIN is alexandrapintea.eu.
    """
    assert resolve(headers={"host": "localhost"}).pk == alex_site.pk


@pytest.mark.django_db
def test_port_and_case_are_normalised(roam_site):
    """A dev host is ROAMLITERARY.COM:4200, and that must still match."""
    assert resolve(headers={"host": "ROAMLITERARY.COM:4200"}).pk == roam_site.pk


@pytest.mark.django_db
def test_inactive_site_is_not_resolved(alex_site, roam_site):
    """is_active=False takes a tenant offline; it must fall back, not serve."""
    roam_site.is_active = False
    roam_site.save()
    assert resolve(headers={"host": "roamliterary.com"}).pk == alex_site.pk


@pytest.mark.django_db
def test_site_is_lazy(alex_site):
    """The query must not fire for requests that never read request.site.

    Admin and static requests go through this middleware on every hit; making
    them pay for a tenant lookup they do not use is the reason it is lazy.
    """
    request = RequestFactory().get("/", headers={"host": "alexandrapintea.eu"})
    SiteMiddleware(lambda req: "response")(request)

    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as queries:
        assert request.site.domain == "alexandrapintea.eu"
    assert len(queries) == 1, "the lookup should happen on first access, not before"
