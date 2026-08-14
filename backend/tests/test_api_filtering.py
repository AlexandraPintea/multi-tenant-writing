"""Per-site and per-language filtering on the list endpoints (architecture §4.2).

Every request carries X-Site-Domain, which is how SSR identifies the tenant and
how these tests avoid depending on hosts-file entries.
"""

import pytest

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}


def slugs(response):
    return [item["slug"] for item in response.json()["results"]]


@pytest.mark.django_db
def test_site_config_reflects_the_requesting_tenant(client, alex_site, roam_site):
    alex = client.get("/api/site-config/", headers=ALEX).json()
    roam = client.get("/api/site-config/", headers=ROAM).json()

    assert alex["layout"] == "editorial"
    assert alex["enabled_languages"] == ["en", "ro"]
    assert roam["layout"] == "collective"
    assert roam["enabled_languages"] == ["en"]
    # theme must not leak the layout key it was split out of
    assert "layout" not in alex["theme"]


@pytest.mark.django_db
def test_post_list_is_scoped_to_the_site(client, bilingual_post, english_only_post):
    assert set(slugs(client.get("/api/posts/", headers=ALEX))) == {
        "the-power-of-words",
        "writing-in-the-margins",
    }
    # Roam sees only the piece actually published there.
    assert slugs(client.get("/api/posts/", headers=ROAM)) == ["the-power-of-words"]


@pytest.mark.django_db
def test_unpublished_posts_are_never_listed(client, bilingual_post):
    bilingual_post.is_published = False
    bilingual_post.save()
    assert slugs(client.get("/api/posts/", headers=ALEX)) == []


@pytest.mark.django_db
def test_romanian_archive_excludes_the_english_only_post(
    client, bilingual_post, english_only_post
):
    """§4.3 list rule: the RO archive holds only posts that exist in RO."""
    response = client.get("/api/posts/", {"lang": "ro"}, headers=ALEX)
    assert slugs(response) == ["the-power-of-words"]
    assert response.json()["results"][0]["title"] == "Puterea Cuvintelor"


@pytest.mark.django_db
def test_unknown_language_is_coerced_to_the_default(
    client, bilingual_post, english_only_post
):
    """§4.3 rule 3 — silently, not as an error."""
    coerced = client.get("/api/posts/", {"lang": "de"}, headers=ALEX)
    english = client.get("/api/posts/", {"lang": "en"}, headers=ALEX)
    assert slugs(coerced) == slugs(english)


@pytest.mark.django_db
def test_language_not_enabled_on_this_site_is_coerced(client, bilingual_post):
    """RO is a real language, but roamliterary.com does not enable it."""
    response = client.get("/api/posts/", {"lang": "ro"}, headers=ROAM)
    assert response.json()["results"][0]["title"] == "The Power of Words"


@pytest.mark.django_db
def test_list_response_is_paginated(client, bilingual_post):
    body = client.get("/api/posts/", headers=ALEX).json()
    assert set(body) >= {"count", "next", "previous", "results"}


@pytest.mark.django_db
def test_embedded_author_is_the_requesting_sites_profile(
    client, bilingual_post, alex_author, roam_author
):
    """The bug A.2 fixed. Both profiles share a name and slug, so this asserts
    on the bio, which is the only field that actually differs."""
    alex_detail = client.get("/api/authors/alexandra-pintea/", headers=ALEX).json()
    roam_detail = client.get("/api/authors/alexandra-pintea/", headers=ROAM).json()

    assert alex_detail["bio"] == "Writer based in Romania."
    assert roam_detail["bio"] == "The literary voice behind Roam Literary."


@pytest.mark.django_db
def test_author_detail_includes_cross_posted_work(client, bilingual_post, roam_author):
    """Roam's author page returned nothing at all before A.2."""
    body = client.get("/api/authors/alexandra-pintea/", headers=ROAM).json()
    assert [post["slug"] for post in body["posts"]] == ["the-power-of-words"]


@pytest.mark.django_db
def test_author_detail_posts_are_site_scoped(
    client, bilingual_post, english_only_post, alex_author
):
    body = client.get("/api/authors/alexandra-pintea/", headers=ALEX).json()
    assert set(post["slug"] for post in body["posts"]) == {
        "the-power-of-words",
        "writing-in-the-margins",
    }


@pytest.mark.django_db
def test_author_list_is_scoped(client, alex_author, roam_author):
    roam = client.get("/api/authors/", headers=ROAM).json()
    assert roam["count"] == 1
    assert roam["results"][0]["social_links"] == roam_author.social_links


@pytest.mark.django_db
def test_page_is_scoped_to_its_site(client, roam_site, alex_page):
    # roam_site is required: without it the X-Site-Domain header names a
    # domain that does not exist, and the middleware's fallback resolves the
    # request to alexandrapintea.eu — turning the 404 into a 200.
    assert client.get("/api/pages/about/", headers=ALEX).status_code == 200
    assert client.get("/api/pages/about/", headers=ROAM).status_code == 404
