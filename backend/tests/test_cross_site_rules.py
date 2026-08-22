"""The Author/Category cross-site rules on Post (A.2 and A.1).

Neither can be a database CheckConstraint: both compare against Post.sites,
which is an M2M and therefore not visible to a row-level constraint. The rules
live in Post.clean() for saved rows and in PostAdminForm for creations, so both
layers are exercised here.
"""

import pytest
from django.core.exceptions import ValidationError
from model_bakery import baker

from content.admin import PostAdminForm
from content.models import Post
from people.models import Author


@pytest.mark.django_db
def test_author_from_another_site_is_rejected(roam_site, alex_author, bilingual_post):
    """An alexandrapintea profile cannot be the byline on a Roam-only post."""
    post = Post.objects.create(slug="roam-only")
    post.sites.set([roam_site])
    post.authors.set([alex_author])

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "authors" in excinfo.value.message_dict


@pytest.mark.django_db
def test_two_authors_for_the_same_site_are_rejected(alex_site, alex_author):
    """One byline per site — the M2M holds profiles, not co-authors."""
    # baker earns its place here: this row exists only to be a second author on
    # the same site, and nothing reads its translated bio.
    second = baker.make(Author, site=alex_site, slug="someone-else")
    post = Post.objects.create(slug="two-bylines")
    post.sites.set([alex_site])
    post.authors.set([alex_author, second])

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "authors" in excinfo.value.message_dict


@pytest.mark.django_db
def test_one_author_per_site_on_a_cross_posted_piece_is_valid(bilingual_post):
    """Two authors total, but one each — the case the M2M exists for."""
    bilingual_post.full_clean()


@pytest.mark.django_db
def test_missing_profile_on_one_site_is_valid(alex_site, roam_site, alex_author):
    """A writer with no Roam profile still cross-posts; the byline is just null."""
    post = Post.objects.create(slug="no-roam-profile")
    post.sites.set([alex_site, roam_site])
    post.authors.set([alex_author])
    post.full_clean()

    assert post.author_for_site(roam_site) is None
    assert post.author_for_site(alex_site) == alex_author


@pytest.mark.django_db
def test_category_from_another_site_is_rejected(roam_site, alex_essay, roam_author):
    post = Post.objects.create(slug="roam-wrong-category")
    post.sites.set([roam_site])
    post.authors.set([roam_author])
    post.category = alex_essay
    post.save()

    with pytest.raises(ValidationError) as excinfo:
        post.full_clean()
    assert "category" in excinfo.value.message_dict


@pytest.mark.django_db
def test_admin_form_rejects_a_cross_site_author(alex_site, roam_site, alex_author):
    """The form is the layer that catches a bad *creation*: on a new Post the
    M2M lives in cleaned_data, so Post.clean() cannot see it."""
    form = PostAdminForm(
        data={
            "slug": "new-post",
            "sites": [roam_site.pk],
            "authors": [alex_author.pk],
            "is_published": False,
        }
    )
    assert not form.is_valid()
    assert "authors" in form.errors


@pytest.mark.django_db
def test_admin_form_accepts_a_matching_author(roam_site, roam_author):
    form = PostAdminForm(
        data={
            "slug": "new-post",
            "sites": [roam_site.pk],
            "authors": [roam_author.pk],
            "is_published": False,
            "title": "A new piece",
            "body": "Body text.",
        }
    )
    assert form.is_valid(), form.errors


@pytest.mark.django_db
def test_admin_form_exposes_the_translated_fields():
    """Regression: PostAdminForm once subclassed a plain ModelForm, which
    replaced parler's TranslatableModelForm and silently dropped every
    translated field — leaving no way to type a post's text in the admin."""
    assert {"title", "body", "excerpt", "is_published"} <= set(
        PostAdminForm.base_fields
    )
