"""The publishing rule (architecture §4.3 and the §9 risk row).

A Post is publishable as soon as ONE of its target sites' enabled languages has
a non-empty title and body — not all of them. That asymmetry is the whole point:
it is what lets an English-only piece live on a bilingual site while still
guaranteeing a reader never lands on an empty page.
"""

import pytest
from django.core.exceptions import ValidationError

from content.models import Post


def make_post(slug, sites, translations, published=True):
    post = Post.objects.create(slug=slug, is_published=published)
    for language, (title, body) in translations.items():
        post.set_current_language(language)
        post.title = title
        post.body = body
        post.save()
    post.sites.set(sites)
    return post


@pytest.mark.django_db
def test_one_complete_language_is_enough(alex_site):
    """EN-only on a bilingual site is publishable — RO is simply absent."""
    post = make_post("en-only", [alex_site], {"en": ("Title", "Body")})
    post.full_clean()


@pytest.mark.django_db
def test_a_post_with_no_translations_cannot_be_published(alex_site):
    post = Post.objects.create(slug="empty", is_published=True)
    post.sites.set([alex_site])

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "is_published" in excinfo.value.message_dict


@pytest.mark.django_db
def test_a_blank_body_does_not_count(alex_site):
    """A title alone is a headline, not a piece."""
    post = make_post("blank-body", [alex_site], {"en": ("Title", "   ")})

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "is_published" in excinfo.value.message_dict


@pytest.mark.django_db
def test_a_blank_title_does_not_count(alex_site):
    post = make_post("blank-title", [alex_site], {"en": ("", "Body")})

    with pytest.raises(ValidationError):
        post.full_clean()


@pytest.mark.django_db
def test_a_translation_in_a_language_the_site_does_not_enable_does_not_count(
    roam_site,
):
    """roamliterary.com enables EN only. A Romanian-only piece there would
    render as an empty page for every visitor, so it cannot be published."""
    post = make_post("ro-on-roam", [roam_site], {"ro": ("Titlu", "Corp")})

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "is_published" in excinfo.value.message_dict


@pytest.mark.django_db
def test_the_same_post_is_publishable_on_a_site_that_enables_romanian(
    alex_site, roam_site
):
    """Identical content, different target site — the rule follows the sites."""
    post = make_post("ro-only", [alex_site], {"ro": ("Titlu", "Corp")})
    post.full_clean()


@pytest.mark.django_db
def test_a_draft_is_never_blocked(alex_site):
    """The rule guards publication, not saving. Drafts start empty by nature."""
    post = Post.objects.create(slug="draft", is_published=False)
    post.sites.set([alex_site])
    post.full_clean()


@pytest.mark.django_db
def test_publishing_with_no_target_site_is_rejected(db):
    """No sites means no enabled languages, so nothing can satisfy the rule —
    and a post published nowhere is meaningless anyway."""
    post = Post.objects.create(slug="nowhere", is_published=True)
    post.set_current_language("en")
    post.title = "Title"
    post.body = "Body"
    post.save()

    with pytest.raises(ValidationError):
        post.full_clean()
