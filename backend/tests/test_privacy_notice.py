"""The privacy notice, and the page content it is written in.

Not a test of whether the notice is legally sufficient — nothing here can
establish that. What is testable is that it exists on every site, in both
languages, that it is reachable, and that it still carries the markers that say
it is a draft.
"""

import pytest
from django.core.management import call_command

from content.models import Page

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}


@pytest.mark.django_db
class TestPageContentIsSanitized:
    def test_page_content_is_cleaned_on_save(self, alex_site):
        # Page.content became markup when the notice needed headings; the same
        # allowlist that guards post bodies has to guard this too.
        page = Page.objects.create(site=alex_site, slug="unsafe")
        page.set_current_language("en")
        page.title = "Unsafe"
        page.content = "<h2>Fine</h2><script>alert(1)</script>"
        page.save()

        stored = Page.objects.get(pk=page.pk)
        stored.set_current_language("en")
        assert "<h2>Fine</h2>" in stored.content
        assert "script" not in stored.content

    def test_plain_text_page_content_becomes_paragraphs(self, alex_site):
        page = Page.objects.create(site=alex_site, slug="prose")
        page.set_current_language("en")
        page.title = "Prose"
        page.content = "First para.\n\nSecond para."
        page.save()

        stored = Page.objects.get(pk=page.pk)
        stored.set_current_language("en")
        assert stored.content == "<p>First para.</p>\n\n<p>Second para.</p>"


@pytest.mark.django_db
class TestSeedPrivacyNotice:
    def test_every_site_gets_a_notice_in_both_languages(self, alex_site, roam_site):
        call_command("seed_privacy_notice")

        for site in (alex_site, roam_site):
            page = Page.objects.get(site=site, slug="privacy")
            for language in ("en", "ro"):
                page.set_current_language(language)
                assert page.title
                assert "<h2>" in page.content

    def test_the_notice_still_says_it_is_a_draft(self, alex_site):
        # The controller's contact address is the one thing code cannot know.
        # If this assertion ever fails, someone filled it in — which is the
        # point at which a human should also have read the rest.
        call_command("seed_privacy_notice")

        page = Page.objects.get(site=alex_site, slug="privacy")
        page.set_current_language("en")
        assert "ADD YOUR CONTACT EMAIL" in page.content

    def test_it_does_not_overwrite_an_edited_notice(self, alex_site):
        # Re-running the seeder must not silently discard wording someone
        # amended in the admin — a privacy notice is not scratch content.
        call_command("seed_privacy_notice")
        page = Page.objects.get(site=alex_site, slug="privacy")
        page.set_current_language("en")
        page.content = "<p>My own carefully worded notice.</p>"
        page.save()

        call_command("seed_privacy_notice")

        page = Page.objects.get(site=alex_site, slug="privacy")
        page.set_current_language("en")
        assert page.content == "<p>My own carefully worded notice.</p>"

    def test_force_overwrites(self, alex_site):
        call_command("seed_privacy_notice")
        page = Page.objects.get(site=alex_site, slug="privacy")
        page.set_current_language("en")
        page.content = "<p>Replace me.</p>"
        page.save()

        call_command("seed_privacy_notice", force=True)

        page = Page.objects.get(site=alex_site, slug="privacy")
        page.set_current_language("en")
        assert "Who is responsible" in page.content

    def test_the_notice_is_served_per_site(self, client, alex_site, roam_site):
        call_command("seed_privacy_notice")

        for headers in (ALEX, ROAM):
            response = client.get("/api/pages/privacy/", headers=headers)
            assert response.status_code == 200
            assert response.json()["title"] == "Privacy"

    def test_the_notice_is_available_in_romanian(self, client, alex_site):
        call_command("seed_privacy_notice")

        response = client.get("/api/pages/privacy/", {"lang": "ro"}, headers=ALEX)
        assert response.status_code == 200
        assert response.json()["title"] == "Confidențialitate"
