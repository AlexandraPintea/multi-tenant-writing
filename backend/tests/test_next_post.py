"""The "next post" link: the next piece down the archive, i.e. the older one.

Adjacency is a property of (post, site, language), not of the post — a
cross-posted piece has different neighbours on each domain, and a post with no
translation in the active language is not in that archive at all. Every test
here pins one of the ways that can go wrong.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from content.models import Post

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}


def make_post(slug, site, published_at, *, languages=("en",), title=None):
    post = Post.objects.create(slug=slug, is_published=True, published_at=published_at)
    post.sites.set([site] if not isinstance(site, list) else site)
    for language in languages:
        post.set_current_language(language)
        post.title = title or slug
        post.body = "Body."
    post.save()
    return post


def next_post(client, slug, headers=ALEX, lang="en"):
    response = client.get(f"/api/posts/{slug}/", {"lang": lang}, headers=headers)
    assert response.status_code == 200
    return response.json()["next_post"]


@pytest.mark.django_db
def test_next_post_is_the_older_one(client, alex_site):
    now = timezone.now()
    make_post("newest", alex_site, now)
    make_post("middle", alex_site, now - timedelta(days=1))
    make_post("oldest", alex_site, now - timedelta(days=2))

    assert next_post(client, "newest")["slug"] == "middle"
    assert next_post(client, "middle")["slug"] == "oldest"


@pytest.mark.django_db
def test_the_oldest_post_has_no_next(client, alex_site):
    now = timezone.now()
    make_post("newer", alex_site, now)
    make_post("older", alex_site, now - timedelta(days=1))

    assert next_post(client, "older") is None


@pytest.mark.django_db
def test_the_link_carries_the_title_in_the_active_language(client, alex_site):
    now = timezone.now()
    make_post("current", alex_site, now, languages=("en", "ro"))
    older = make_post("older", alex_site, now - timedelta(days=1), languages=("en",))
    older.set_current_language("ro")
    older.title = "Titlu românesc"
    older.body = "Corp."
    older.save()

    assert next_post(client, "current", lang="en")["title"] == "older"
    assert next_post(client, "current", lang="ro")["title"] == "Titlu românesc"


@pytest.mark.django_db
def test_a_post_missing_this_language_is_skipped(client, alex_site):
    # The Romanian archive does not contain the English-only piece, so it must
    # not be offered as the next thing to read in Romanian either.
    now = timezone.now()
    make_post("current", alex_site, now, languages=("en", "ro"))
    make_post("english-only", alex_site, now - timedelta(days=1), languages=("en",))
    make_post(
        "bilingual-older", alex_site, now - timedelta(days=2), languages=("en", "ro")
    )

    assert next_post(client, "current", lang="en")["slug"] == "english-only"
    assert next_post(client, "current", lang="ro")["slug"] == "bilingual-older"


@pytest.mark.django_db
def test_adjacency_is_per_site(client, alex_site, roam_site):
    # Both Sites must exist: an X-Site-Domain naming a site the test never
    # created silently falls back to DEFAULT_SITE_DOMAIN and the assertion
    # quietly passes against the wrong tenant.
    now = timezone.now()
    make_post("shared", [alex_site, roam_site], now)
    make_post("alex-only", alex_site, now - timedelta(days=1))
    make_post("roam-only", roam_site, now - timedelta(days=2))

    assert next_post(client, "shared", headers=ALEX)["slug"] == "alex-only"
    assert next_post(client, "shared", headers=ROAM)["slug"] == "roam-only"


@pytest.mark.django_db
def test_unpublished_posts_are_skipped(client, alex_site):
    now = timezone.now()
    make_post("current", alex_site, now)
    draft = make_post("draft", alex_site, now - timedelta(days=1))
    draft.is_published = False
    draft.save()
    make_post("published-older", alex_site, now - timedelta(days=2))

    assert next_post(client, "current")["slug"] == "published-older"


@pytest.mark.django_db
def test_an_undated_post_sits_above_the_dated_ones(client, alex_site):
    # Postgres sorts NULLs first on DESC, so an undated post is at the top of
    # the archive; its next is therefore the newest dated post, not nothing.
    make_post("dated", alex_site, timezone.now())
    make_post("undated", alex_site, None)

    assert next_post(client, "undated")["slug"] == "dated"
    assert next_post(client, "dated") is None


@pytest.mark.django_db
def test_posts_sharing_a_timestamp_have_a_stable_order(client, alex_site):
    # Without the id tie-break these two would each claim the other as "next",
    # or neither would, depending on the plan the database picked.
    same = timezone.now()
    first = make_post("first", alex_site, same)
    second = make_post("second", alex_site, same)

    # -id puts the later-created row first, so its neighbour is the earlier one.
    assert second.id > first.id
    assert next_post(client, "second")["slug"] == "first"
    assert next_post(client, "first") is None


@pytest.mark.django_db
def test_list_payloads_do_not_carry_next_post(client, alex_site):
    # An adjacency query per row would be N+1 for a link the archive never
    # renders.
    make_post("one", alex_site, timezone.now())

    listed = client.get("/api/posts/", headers=ALEX).json()["results"][0]
    assert "next_post" not in listed
