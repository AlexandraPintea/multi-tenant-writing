"""Reader comments: submitted anonymously, published only after approval.

The moderation gate is the whole security model here — the endpoint is
deliberately open, so every test that matters is about what does *not* reach a
page.
"""

import pytest
from django.core.cache import cache

from content.models import Comment

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}

URL = "/api/posts/the-power-of-words/comments/"
DETAIL = "/api/posts/the-power-of-words/"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Throttle counters live in LocMemCache, which outlives a test.

    Without this the suite is order-dependent: whichever test posts sixth in a
    given process gets a 429 it never asked for.
    """
    cache.clear()
    yield
    cache.clear()


def submit(client, headers=ALEX, **overrides):
    payload = {"name": "Reader", "body": "A thoughtful remark."} | overrides
    return client.post(URL, payload, content_type="application/json", headers=headers)


def comments_on(client, headers=ALEX, lang="en"):
    response = client.get(DETAIL, {"lang": lang}, headers=headers)
    assert response.status_code == 200
    return response.json()["comments"]


@pytest.mark.django_db
class TestSubmitting:
    def test_a_submission_is_stored_unapproved(self, client, bilingual_post):
        assert submit(client).status_code == 201

        comment = Comment.objects.get()
        assert comment.is_approved is False
        assert comment.name == "Reader"

    def test_a_new_comment_is_not_on_the_page(self, client, bilingual_post):
        submit(client)
        assert comments_on(client) == []

    def test_an_approved_comment_is_on_the_page(self, client, bilingual_post):
        submit(client)
        Comment.objects.update(is_approved=True)

        published = comments_on(client)
        assert [c["name"] for c in published] == ["Reader"]
        assert published[0]["body"] == "A thoughtful remark."

    def test_the_payload_cannot_choose_its_own_approval_or_tenant(
        self, client, bilingual_post, alex_site, roam_site
    ):
        # is_approved and site are not writable fields, so naming them does
        # nothing at all — which is the point of declaring the write serializer
        # by allowlist rather than exclusion.
        submit(client, headers=ROAM, is_approved=True, site=alex_site.id)

        comment = Comment.objects.get()
        assert comment.is_approved is False
        assert comment.site_id == roam_site.id

    def test_the_reading_language_is_recorded(self, client, bilingual_post):
        # Not used for filtering — the thread is shared — but it is the only
        # record of which copy a reader was actually looking at, and moderation
        # wants that context.
        submit(client, headers=ALEX)
        client.post(
            f"{URL}?lang=ro",
            {"name": "Cititor", "body": "O remarcă."},
            content_type="application/json",
            headers=ALEX,
        )
        assert set(Comment.objects.values_list("language_code", flat=True)) == {
            "en",
            "ro",
        }


@pytest.mark.django_db
class TestScoping:
    def test_a_comment_on_one_tenant_is_invisible_on_the_other(
        self, client, bilingual_post, alex_site, roam_site
    ):
        # Both Sites must exist or the X-Site-Domain fallback quietly serves
        # alexandrapintea.eu for both requests and this passes for free.
        submit(client, headers=ROAM, name="Roam reader")
        Comment.objects.update(is_approved=True)

        assert [c["name"] for c in comments_on(client, ROAM)] == ["Roam reader"]
        assert comments_on(client, ALEX) == []

    def test_cannot_comment_on_a_post_from_another_site(
        self, client, english_only_post, alex_site, roam_site
    ):
        # The English-only piece is published on alexandrapintea.eu alone.
        response = client.post(
            "/api/posts/writing-in-the-margins/comments/",
            {"name": "R", "body": "Hello there."},
            content_type="application/json",
            headers=ROAM,
        )
        assert response.status_code == 404
        assert Comment.objects.count() == 0

    def test_cannot_comment_on_an_unpublished_post(
        self, client, bilingual_post, unpublish
    ):
        unpublish(bilingual_post)

        assert submit(client).status_code == 404
        assert Comment.objects.count() == 0

    def test_the_thread_is_shared_across_languages(self, client, bilingual_post):
        # One URL, one conversation: a thread that vanished on switching
        # language would be baffling.
        submit(client)
        Comment.objects.update(is_approved=True)

        assert len(comments_on(client, lang="en")) == 1
        assert len(comments_on(client, lang="ro")) == 1


@pytest.mark.django_db
class TestValidation:
    @pytest.mark.parametrize(
        "payload,field",
        [
            ({"name": "", "body": "Long enough."}, "name"),
            ({"name": "   ", "body": "Long enough."}, "name"),
            ({"name": "R", "body": ""}, "body"),
            ({"name": "R", "body": "   "}, "body"),
            ({"name": "R" * 81, "body": "Long enough."}, "name"),
            ({"name": "R", "body": "x" * 4001}, "body"),
        ],
    )
    def test_bad_submissions_name_the_offending_field(
        self, client, bilingual_post, payload, field
    ):
        response = client.post(
            URL, payload, content_type="application/json", headers=ALEX
        )
        assert response.status_code == 400
        # The frontend maps this shape onto its form controls.
        assert field in response.json()
        assert Comment.objects.count() == 0


@pytest.mark.django_db
class TestAbuse:
    def test_a_filled_honeypot_is_discarded_silently(self, client, bilingual_post):
        # 201 so a bot learns nothing, and no row so nothing reaches the queue.
        assert submit(client, url2="http://spam.example").status_code == 201
        assert Comment.objects.count() == 0

    def test_submissions_are_rate_limited(self, client, bilingual_post):
        statuses = [
            submit(client, body=f"Comment number {i}.").status_code for i in range(6)
        ]

        assert statuses[:5] == [201] * 5
        assert statuses[5] == 429
        assert Comment.objects.count() == 5
