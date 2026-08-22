"""Per-post language coverage: the 404-with-hint contract (architecture §4.3).

The frontend's NgRx effect branches on the *shape* of this 404 — a body with
available_languages dispatches loadPostDetailNotInLanguage and renders "only
available in English", while a bare 404 is a genuine not-found. Flattening the
two would silently turn a useful message into a dead end, which is why the
distinction is tested rather than assumed.
"""

import pytest

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}


@pytest.mark.django_db
def test_bilingual_post_is_reachable_in_both_languages(client, bilingual_post):
    english = client.get("/api/posts/the-power-of-words/", {"lang": "en"}, headers=ALEX)
    romanian = client.get(
        "/api/posts/the-power-of-words/", {"lang": "ro"}, headers=ALEX
    )

    assert english.status_code == romanian.status_code == 200
    assert english.json()["title"] == "The Power of Words"
    assert romanian.json()["title"] == "Puterea Cuvintelor"
    # Wrapped, because bodies are HTML now: the fixture writes plain text and
    # the save hook promotes it to a paragraph (content/sanitize.py). Asserted
    # exactly rather than with `in`, so the wrapping reads as intended
    # behaviour rather than something merely tolerated.
    assert romanian.json()["body"] == "<p>Cuvintele modelează lumi.</p>"


@pytest.mark.django_db
def test_english_only_post_404s_in_romanian(client, english_only_post):
    """No language fallback: a post that has no RO version is not reachable in RO."""
    response = client.get(
        "/api/posts/writing-in-the-margins/", {"lang": "ro"}, headers=ALEX
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_that_404_carries_the_available_languages_hint(client, english_only_post):
    response = client.get(
        "/api/posts/writing-in-the-margins/", {"lang": "ro"}, headers=ALEX
    )
    body = response.json()
    assert body["available_languages"] == ["en"]
    assert "detail" in body


@pytest.mark.django_db
def test_english_only_post_is_fine_in_english(client, english_only_post):
    response = client.get(
        "/api/posts/writing-in-the-margins/", {"lang": "en"}, headers=ALEX
    )
    assert response.status_code == 200
    assert response.json()["available_languages"] == ["en"]


@pytest.mark.django_db
def test_wrong_site_is_a_plain_404_without_a_hint(client, roam_site, english_only_post):
    """Different failure, different body: 'not published here' is not a
    translation gap, and offering available_languages would invite the frontend
    to suggest a language switch that cannot help.

    roam_site must exist for this to mean anything: an unknown X-Site-Domain
    falls back to DEFAULT_SITE_DOMAIN, which would quietly resolve the request
    to alexandrapintea.eu and return 200.
    """
    response = client.get("/api/posts/writing-in-the-margins/", headers=ROAM)
    assert response.status_code == 404
    assert "available_languages" not in response.json()


@pytest.mark.django_db
def test_unpublished_post_is_a_plain_404(client, bilingual_post, unpublish):
    """Nothing published anywhere, so there is nothing to hint at.

    A hint here would be worse than useless: it would list the languages a
    draft exists in, telling a stranger what is being written.
    """
    unpublish(bilingual_post)
    response = client.get("/api/posts/the-power-of-words/", headers=ALEX)
    assert response.status_code == 404
    assert "available_languages" not in response.json()


@pytest.mark.django_db
def test_a_language_still_in_draft_404s_with_the_other_one_offered(
    client, bilingual_post, unpublish
):
    """A draft copy fails exactly like a missing one.

    Same 404, same hint, so the language toggle dims Romanian for the same
    reason whether the copy does not exist yet or is not finished — the reader
    cannot tell the difference and does not need to.
    """
    unpublish(bilingual_post, "ro")

    response = client.get(
        "/api/posts/the-power-of-words/", {"lang": "ro"}, headers=ALEX
    )
    assert response.status_code == 404
    assert response.json()["available_languages"] == ["en"]

    response = client.get(
        "/api/posts/the-power-of-words/", {"lang": "en"}, headers=ALEX
    )
    assert response.status_code == 200
    assert response.json()["available_languages"] == ["en"]


@pytest.mark.django_db
def test_list_and_detail_agree(client, english_only_post):
    """Whatever the RO archive lists must be openable in RO, and vice versa.

    Catches the class of bug where one layer gains a fallback the other lacks.
    """
    listed = [
        item["slug"]
        for item in client.get("/api/posts/", {"lang": "ro"}, headers=ALEX).json()[
            "results"
        ]
    ]
    detail = client.get(
        "/api/posts/writing-in-the-margins/", {"lang": "ro"}, headers=ALEX
    )
    assert "writing-in-the-margins" not in listed
    assert detail.status_code == 404
