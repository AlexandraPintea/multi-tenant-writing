"""GET /api/categories/ and the category embedded in post payloads (A.1)."""

import pytest

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}


@pytest.mark.django_db
def test_categories_are_scoped_to_the_site(client, alex_essay, alex_notes, roam_essay):
    alex = client.get("/api/categories/", headers=ALEX).json()
    roam = client.get("/api/categories/", headers=ROAM).json()

    assert alex["count"] == 2
    assert roam["count"] == 1
    # Same slug on both tenants, different rows — unique_together is per site.
    assert roam["results"][0]["slug"] == "essay"


@pytest.mark.django_db
def test_category_names_follow_the_requested_language(client, alex_essay, alex_notes):
    romanian = client.get("/api/categories/", {"lang": "ro"}, headers=ALEX).json()
    assert [item["name"] for item in romanian["results"]] == ["Eseu", "Însemnări"]


@pytest.mark.django_db
def test_categories_are_ordered_by_translated_name(client, alex_essay, alex_notes):
    """Ordering follows the label the reader sees, so it changes with language.

    EN: Essay, Notes. RO: Eseu, Însemnări — same order here by coincidence, so
    the assertion is on the English pair being alphabetical.
    """
    english = client.get("/api/categories/", headers=ALEX).json()
    names = [item["name"] for item in english["results"]]
    assert names == sorted(names)


@pytest.mark.django_db
def test_unknown_language_is_coerced(client, alex_essay):
    coerced = client.get("/api/categories/", {"lang": "de"}, headers=ALEX).json()
    assert coerced["results"][0]["name"] == "Essay"


@pytest.mark.django_db
def test_post_payloads_embed_the_category(client, bilingual_post):
    """Embedded as {slug, name} so a card needs no second request for labels."""
    listed = client.get("/api/posts/", headers=ALEX).json()["results"][0]
    assert listed["category"] == {"slug": "essay", "name": "Essay"}

    detail = client.get("/api/posts/the-power-of-words/", headers=ALEX).json()
    assert detail["category"]["slug"] == "essay"


@pytest.mark.django_db
def test_embedded_category_label_follows_the_language(client, bilingual_post):
    romanian = client.get("/api/posts/", {"lang": "ro"}, headers=ALEX).json()
    assert romanian["results"][0]["category"]["name"] == "Eseu"


@pytest.mark.django_db
def test_post_without_a_category_serializes_null(client, bilingual_post):
    """Existing rows start at NULL by design — this must not 500 or invent a label."""
    bilingual_post.category = None
    bilingual_post.save()
    listed = client.get("/api/posts/", headers=ALEX).json()["results"][0]
    assert listed["category"] is None
