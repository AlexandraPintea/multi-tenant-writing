"""The seeding commands.

seed_groups is tested because it is a security surface: a model whose
permissions it forgets is a model the intended editors cannot reach — which is
exactly what happened when Category was added and the Categories page began
returning 403 for roam_editors.
"""

import pytest
from django.contrib.auth.models import Group, User
from django.core.management import call_command

from content.models import Category, Page, Post
from people.models import Author, UserProfile
from sites_core.models import Site

from .conftest import MANAGED_MODELS


@pytest.mark.django_db
def test_seed_demo_data_is_idempotent():
    call_command("seed_demo_data")
    counts = (
        Site.objects.count(),
        Author.objects.count(),
        Post.objects.count(),
        Page.objects.count(),
        Category.objects.count(),
    )

    call_command("seed_demo_data")
    assert (
        Site.objects.count(),
        Author.objects.count(),
        Post.objects.count(),
        Page.objects.count(),
        Category.objects.count(),
    ) == counts


@pytest.mark.django_db
def test_seed_demo_data_builds_the_cross_posting_fixture():
    call_command("seed_demo_data")
    post = Post.objects.get(slug="the-power-of-words")

    assert post.sites.count() == 2
    # One author profile per site, which is what makes both author pages work.
    assert sorted(a.site.domain for a in post.authors.all()) == [
        "alexandrapintea.eu",
        "roamliterary.com",
    ]


@pytest.mark.django_db
def test_seed_demo_data_preserves_a_hand_made_category_assignment():
    call_command("seed_demo_data")
    post = Post.objects.get(slug="the-power-of-words")
    other = Category.objects.get(site__domain="alexandrapintea.eu", slug="fiction")
    post.category = other
    post.save(update_fields=["category"])

    call_command("seed_demo_data")
    post.refresh_from_db()
    assert post.category == other


@pytest.mark.django_db
def test_seed_groups_covers_every_managed_model():
    """The regression that motivated this test: a new model silently arrives
    without permissions, and the group that should manage it gets a 403."""
    call_command("seed_demo_data")
    call_command("seed_groups")

    for group_name in ("alexandra_admin", "roam_editors"):
        granted = {
            (permission.content_type.app_label, permission.content_type.model)
            for permission in Group.objects.get(name=group_name).permissions.all()
        }
        assert granted == set(MANAGED_MODELS)


@pytest.mark.django_db
def test_seed_groups_accounts_are_staff_but_not_superusers():
    call_command("seed_demo_data")
    call_command("seed_groups")

    for email, domain in (
        ("alex_admin@example.com", "alexandrapintea.eu"),
        ("roam_editor@example.com", "roamliterary.com"),
    ):
        user = User.objects.get(username=email)
        assert user.is_staff and not user.is_superuser
        assert user.profile.site.domain == domain


@pytest.mark.django_db
def test_seed_groups_is_idempotent():
    call_command("seed_demo_data")
    call_command("seed_groups")
    call_command("seed_groups")

    assert (
        Group.objects.filter(name__in=["alexandra_admin", "roam_editors"]).count() == 2
    )
    assert UserProfile.objects.count() == 2


@pytest.mark.django_db
def test_seed_groups_refuses_to_run_without_sites():
    from django.core.management.base import CommandError

    with pytest.raises(CommandError, match="seed_demo_data"):
        call_command("seed_groups")
