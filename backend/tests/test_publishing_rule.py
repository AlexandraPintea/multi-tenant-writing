"""The publishing rule (architecture §4.3 and the §9 risk row).

Publication is a property of a *copy*, not of a post: the English piece can be
out while the Romanian one is still being written. So the rule applies once per
published copy — it needs a title, a body, and a language one of the post's
target sites enables — and a copy left as a draft is never held to it.

The older rule asked for one complete language anywhere on the post and then
published all of them, which is what put an empty Romanian page in front of
readers whenever an English piece went out first.
"""

import pytest
from django.core.exceptions import ValidationError

from content.admin import PostAdminForm
from content.models import Post


def make_post(slug, sites, translations):
    """`translations` maps a language to (title, body, published)."""
    post = Post.objects.create(slug=slug)
    for language, (title, body, published) in translations.items():
        post.set_current_language(language)
        post.title = title
        post.body = body
        post.is_published = published
        post.save()
    post.sites.set(sites)
    return post


@pytest.mark.django_db
def test_a_complete_copy_can_be_published(alex_site):
    post = make_post("en-only", [alex_site], {"en": ("Title", "Body", True)})
    post.full_clean()
    assert post.published_languages() == ["en"]


@pytest.mark.django_db
def test_english_can_go_out_while_romanian_is_still_a_draft(alex_site):
    """The change this rule exists for.

    The Romanian copy is deliberately incomplete — a title and nothing else —
    and that does not stop the English one from being published.
    """
    post = make_post(
        "half-written",
        [alex_site],
        {
            "en": ("The Power of Words", "Words shape worlds.", True),
            "ro": ("Puterea Cuvintelor", "", False),
        },
    )
    post.full_clean()
    assert post.published_languages() == ["en"]


@pytest.mark.django_db
def test_each_published_copy_has_to_stand_on_its_own(alex_site):
    """A finished English copy no longer vouches for an empty Romanian one."""
    post = make_post(
        "empty-romanian",
        [alex_site],
        {
            "en": ("Title", "Body", True),
            "ro": ("Titlu", "   ", True),
        },
    )

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "is_published" in excinfo.value.message_dict


@pytest.mark.django_db
def test_a_blank_title_does_not_count_either(alex_site):
    post = make_post("blank-title", [alex_site], {"en": ("", "Body", True)})

    with pytest.raises(ValidationError):
        post.full_clean()


@pytest.mark.django_db
def test_a_draft_copy_is_never_blocked(alex_site):
    """The rule guards publication, not saving. Drafts start empty by nature."""
    post = make_post("draft", [alex_site], {"en": ("", "", False)})
    post.full_clean()
    assert post.published_languages() == []


@pytest.mark.django_db
def test_a_post_with_no_translations_publishes_nothing(alex_site):
    post = Post.objects.create(slug="empty")
    post.sites.set([alex_site])

    post.full_clean()
    assert post.published_languages() == []


@pytest.mark.django_db
def test_a_language_no_target_site_enables_cannot_be_published(roam_site):
    """roamliterary.com enables EN only. A published Romanian copy there would
    render as an empty page for every visitor, so it cannot be published."""
    post = make_post("ro-on-roam", [roam_site], {"ro": ("Titlu", "Corp", True)})

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "is_published" in excinfo.value.message_dict


@pytest.mark.django_db
def test_the_same_copy_is_publishable_on_a_site_that_enables_romanian(alex_site):
    """Identical content, different target site — the rule follows the sites."""
    post = make_post("ro-only", [alex_site], {"ro": ("Titlu", "Corp", True)})
    post.full_clean()
    assert post.published_languages() == ["ro"]


@pytest.mark.django_db
def test_publishing_with_no_target_site_is_rejected(db):
    """No sites means no enabled languages, so nothing can satisfy the rule —
    and a post published nowhere is meaningless anyway."""
    post = make_post("nowhere", [], {"en": ("Title", "Body", True)})

    with pytest.raises(ValidationError):
        post.full_clean()


class TestTheAdminForm:
    """Where a *creation* is caught: on a new Post the M2M lives in
    cleaned_data, so Post.clean() cannot see the target sites at all.

    The form only ever sees one language — whichever tab is open — which is
    exactly the copy being published, so one language is all it needs.
    """

    @pytest.mark.django_db
    def test_a_complete_copy_is_accepted(self, alex_site, alex_author):
        form = PostAdminForm(
            data={
                "slug": "new-post",
                "sites": [alex_site.pk],
                "authors": [alex_author.pk],
                "title": "A new piece",
                "body": "Body text.",
                "is_published": True,
            }
        )
        assert form.is_valid(), form.errors

    @pytest.mark.django_db
    def test_publishing_a_language_no_site_enables_is_rejected(
        self, roam_site, roam_author
    ):
        # The Romanian tab of a Roam-only post. language_code is what
        # TranslatableAdmin.get_form() sets on the subclass it builds per tab.
        class RomanianTab(PostAdminForm):
            language_code = "ro"

        form = RomanianTab(
            data={
                "slug": "new-post",
                "sites": [roam_site.pk],
                "authors": [roam_author.pk],
                "title": "Titlu",
                "body": "Corp.",
                "is_published": True,
            }
        )
        assert not form.is_valid()
        assert "is_published" in form.errors

    @pytest.mark.django_db
    def test_the_same_tab_is_fine_on_a_bilingual_site(self, alex_site, alex_author):
        class RomanianTab(PostAdminForm):
            language_code = "ro"

        form = RomanianTab(
            data={
                "slug": "new-post",
                "sites": [alex_site.pk],
                "authors": [alex_author.pk],
                "title": "Titlu",
                "body": "Corp.",
                "is_published": True,
            }
        )
        assert form.is_valid(), form.errors

    @pytest.mark.django_db
    def test_a_draft_tab_is_not_held_to_the_rule(self, roam_site, roam_author):
        class RomanianTab(PostAdminForm):
            language_code = "ro"

        form = RomanianTab(
            data={
                "slug": "new-post",
                "sites": [roam_site.pk],
                "authors": [roam_author.pk],
                "title": "Titlu",
                "body": "Corp.",
                "is_published": False,
            }
        )
        assert form.is_valid(), form.errors
