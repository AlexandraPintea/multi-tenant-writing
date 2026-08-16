"""The contact form: details a reader leaves, read only in the admin.

Never published anywhere, so the tests are about what is stored, who it belongs
to, and what is rejected.
"""

import pytest
from django.core.cache import cache

from content.models import ContactMessage

ALEX = {"x-site-domain": "alexandrapintea.eu"}
ROAM = {"x-site-domain": "roamliterary.com"}

URL = "/api/contact/"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    # Throttle counters live in LocMemCache, which outlives a single test.
    cache.clear()
    yield
    cache.clear()


def send(client, headers=ALEX, **overrides):
    payload = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": "ada@example.com",
    } | overrides
    return client.post(URL, payload, content_type="application/json", headers=headers)


@pytest.mark.django_db
class TestSubmitting:
    def test_details_are_stored(self, client, alex_site):
        assert send(client).status_code == 201

        message = ContactMessage.objects.get()
        assert (message.first_name, message.last_name) == ("Ada", "Lovelace")
        assert message.email == "ada@example.com"
        assert message.is_handled is False

    def test_consent_is_off_unless_it_is_asked_for(self, client, alex_site):
        # Silence is not consent: a submission that says nothing about updates
        # must not become permission to email someone.
        send(client)

        message = ContactMessage.objects.get()
        assert message.consented_to_updates is False
        assert message.consented_at is None

    def test_consent_is_recorded_with_its_wording_and_a_server_timestamp(
        self, client, alex_site
    ):
        wording = "Yes, email me occasional updates about new writing."
        send(client, consented_to_updates=True, consent_text=wording)

        message = ContactMessage.objects.get()
        assert message.consented_to_updates is True
        assert message.consent_text == wording
        # Stamped by the server: a date the sender chose is not evidence.
        assert message.consented_at is not None

    def test_no_timestamp_when_consent_was_not_given(self, client, alex_site):
        send(client, consented_to_updates=False, consent_text="ignored")

        assert ContactMessage.objects.get().consented_at is None

    def test_a_message_belongs_to_the_site_it_was_sent_from(
        self, client, alex_site, roam_site
    ):
        # Both Sites must exist, or an unknown X-Site-Domain falls back to the
        # default and this passes without proving anything.
        send(client, headers=ROAM)

        assert ContactMessage.objects.get().site_id == roam_site.id

    def test_the_payload_cannot_choose_its_own_site_or_handled_flag(
        self, client, alex_site, roam_site
    ):
        send(client, headers=ROAM, site=alex_site.id, is_handled=True)

        message = ContactMessage.objects.get()
        assert message.site_id == roam_site.id
        assert message.is_handled is False

    def test_the_reading_language_is_recorded(self, client, alex_site):
        client.post(
            f"{URL}?lang=ro",
            {"first_name": "Ana", "last_name": "Pop", "email": "ana@example.com"},
            content_type="application/json",
            headers=ALEX,
        )
        assert ContactMessage.objects.get().language_code == "ro"


@pytest.mark.django_db
class TestValidation:
    @pytest.mark.parametrize(
        "overrides,field",
        [
            ({"first_name": ""}, "first_name"),
            ({"first_name": "   "}, "first_name"),
            ({"last_name": ""}, "last_name"),
            ({"email": ""}, "email"),
            ({"email": "not-an-email"}, "email"),
            ({"first_name": "A" * 101}, "first_name"),
        ],
    )
    def test_bad_submissions_name_the_offending_field(
        self, client, alex_site, overrides, field
    ):
        response = send(client, **overrides)

        assert response.status_code == 400
        assert field in response.json()
        assert ContactMessage.objects.count() == 0


@pytest.mark.django_db
class TestAbuse:
    def test_a_filled_honeypot_is_discarded_silently(self, client, alex_site):
        assert send(client, url2="http://spam.example").status_code == 201
        assert ContactMessage.objects.count() == 0

    def test_submissions_are_rate_limited(self, client, alex_site):
        statuses = [
            send(client, email=f"a{i}@example.com").status_code for i in range(6)
        ]

        assert statuses[:5] == [201] * 5
        assert statuses[5] == 429
        assert ContactMessage.objects.count() == 5

    def test_the_comment_throttle_is_a_separate_budget(
        self, client, alex_site, bilingual_post
    ):
        # Scoped rates, not one shared anonymous bucket: filling in the contact
        # form must not use up someone's ability to comment.
        for i in range(5):
            send(client, email=f"a{i}@example.com")

        commented = client.post(
            "/api/posts/the-power-of-words/comments/",
            {"name": "Reader", "body": "Still able to comment."},
            content_type="application/json",
            headers=ALEX,
        )
        assert commented.status_code == 201
