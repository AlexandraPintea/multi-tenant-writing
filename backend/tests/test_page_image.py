"""A photo on a static page — the author portrait on About.

An upload field rather than an <img> pasted into the page content: the admin
gives an upload widget, the file lands in MEDIA_ROOT with everything else, and
the frontend can put the path through its mediaUrl pipe.
"""

import pytest

ALEX = {"x-site-domain": "alexandrapintea.eu"}


def fetch(client, slug="about", lang="en"):
    response = client.get(f"/api/pages/{slug}/", {"lang": lang}, headers=ALEX)
    assert response.status_code == 200
    return response.json()


@pytest.mark.django_db
class TestPageImage:
    def test_a_page_without_a_photo_says_so(self, client, alex_page):
        # Null, not "": the template branches on it, and an empty string in
        # [src] makes the browser re-request the current page as an image.
        payload = fetch(client)
        assert payload["image"] is None

    def test_the_photo_is_served_root_relative(self, client, alex_page):
        alex_page.image = "pages/portrait.jpg"
        alex_page.save()

        assert fetch(client)["image"] == "/media/pages/portrait.jpg"

    def test_the_description_falls_back_to_the_page_title(self, client, alex_page):
        # An author's photo with an empty alt tells a screen-reader user
        # nothing, so a blank description is filled in rather than passed on.
        alex_page.image = "pages/portrait.jpg"
        alex_page.save()

        payload = fetch(client)
        assert payload["image_alt"] == payload["title"]

    def test_a_written_description_wins(self, client, alex_page):
        alex_page.image = "pages/portrait.jpg"
        alex_page.set_current_language("en")
        alex_page.image_alt = "Alexandra at her desk in Zalău"
        alex_page.save()

        assert fetch(client)["image_alt"] == "Alexandra at her desk in Zalău"

    def test_the_description_is_translated(self, client, alex_page):
        alex_page.image = "pages/portrait.jpg"
        for language, description in (
            ("en", "Alexandra at her desk"),
            ("ro", "Alexandra la birou"),
        ):
            alex_page.set_current_language(language)
            alex_page.title = f"About ({language})"
            alex_page.image_alt = description
        alex_page.save()

        assert fetch(client, lang="en")["image_alt"] == "Alexandra at her desk"
        assert fetch(client, lang="ro")["image_alt"] == "Alexandra la birou"
