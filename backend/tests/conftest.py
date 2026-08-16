"""Shared fixtures.

The demo data is rebuilt here rather than reused from seed_demo_data: a test
suite that depends on a management command breaks whenever the seeder changes
for unrelated reasons, and the seeder's job is a pleasant dev environment, not
a controlled fixture set.

Translatable rows are built explicitly with set_current_language(). model_bakery
is used for the throwaway objects a single test needs — it has no idea what a
parler translation is, so it cannot build the fixtures that carry meaning here.
"""

import pytest
from django.contrib.auth.models import Group, Permission, User
from django.utils import timezone

from content.models import Category, Page, Post
from people.models import Author, UserProfile
from sites_core.models import Site

PASSWORD = "test-password"

# Mirrors seed_groups.MANAGED_MODELS. Duplicated on purpose: if the command
# ever stops granting one of these, test_seed_groups catches it instead of the
# tests silently inheriting the same mistake.
MANAGED_MODELS = [
    ("content", "post"),
    ("content", "page"),
    ("content", "category"),
    ("content", "comment"),
    ("content", "contactmessage"),
    ("people", "author"),
]


# --------------------------------------------------------------------- sites


@pytest.fixture
def alex_site(db):
    return Site.objects.create(
        domain="alexandrapintea.eu",
        name="Alexandra Pintea",
        default_language="en",
        enabled_languages=["en", "ro"],
        theme_config={"--accent": "#5b3a29", "layout": "editorial"},
    )


@pytest.fixture
def roam_site(db):
    return Site.objects.create(
        domain="roamliterary.com",
        name="Roam Literary",
        default_language="en",
        enabled_languages=["en"],
        theme_config={"--accent": "#8e44ad", "layout": "collective"},
    )


# ------------------------------------------------------------------- authors


def _make_author(site, slug, name, bios):
    author = Author.objects.create(site=site, name=name, slug=slug)
    for language, bio in bios.items():
        author.set_current_language(language)
        author.bio = bio
        author.save()
    return author


@pytest.fixture
def alex_author(alex_site):
    return _make_author(
        alex_site,
        "alexandra-pintea",
        "Alexandra Pintea",
        {"en": "Writer based in Romania.", "ro": "Scriitoare din România."},
    )


@pytest.fixture
def roam_author(roam_site):
    # Same person, different site: a separate row with its own bio. Same slug
    # as the alexandrapintea profile, which is what made the cross-posting bug
    # invisible until it was checked by primary key.
    return _make_author(
        roam_site,
        "alexandra-pintea",
        "Alexandra Pintea",
        {"en": "The literary voice behind Roam Literary."},
    )


# ---------------------------------------------------------------- categories


def _make_category(site, slug, names):
    category = Category.objects.create(site=site, slug=slug)
    for language, name in names.items():
        category.set_current_language(language)
        category.name = name
        category.save()
    return category


@pytest.fixture
def alex_essay(alex_site):
    return _make_category(alex_site, "essay", {"en": "Essay", "ro": "Eseu"})


@pytest.fixture
def alex_notes(alex_site):
    return _make_category(alex_site, "notes", {"en": "Notes", "ro": "Însemnări"})


@pytest.fixture
def roam_essay(roam_site):
    return _make_category(roam_site, "essay", {"en": "Essay"})


# --------------------------------------------------------------------- posts


def _make_post(slug, translations, sites, authors, category=None, published=True):
    post = Post.objects.create(
        slug=slug,
        is_published=published,
        published_at=timezone.now(),
        category=category,
    )
    for language, fields in translations.items():
        post.set_current_language(language)
        post.title = fields["title"]
        post.body = fields["body"]
        post.excerpt = fields.get("excerpt", "")
        post.save()
    post.sites.set(sites)
    post.authors.set(authors)
    return post


@pytest.fixture
def bilingual_post(alex_site, roam_site, alex_author, roam_author, alex_essay):
    """Cross-posted to both sites, EN + RO, one author profile per site."""
    return _make_post(
        "the-power-of-words",
        {
            "en": {"title": "The Power of Words", "body": "Words shape worlds."},
            "ro": {"title": "Puterea Cuvintelor", "body": "Cuvintele modelează lumi."},
        },
        sites=[alex_site, roam_site],
        authors=[alex_author, roam_author],
        category=alex_essay,
    )


@pytest.fixture
def english_only_post(alex_site, alex_author, alex_notes):
    """On the bilingual site but translated only into English.

    The fixture behind the whole §4.3 language-coverage story: it must 404 in
    Romanian and vanish from the Romanian archive.
    """
    return _make_post(
        "writing-in-the-margins",
        {"en": {"title": "Writing in the Margins", "body": "Notes in margins."}},
        sites=[alex_site],
        authors=[alex_author],
        category=alex_notes,
    )


@pytest.fixture
def alex_page(alex_site):
    page = Page.objects.create(site=alex_site, slug="about")
    page.set_current_language("en")
    page.title = "About"
    page.content = "Essays and fiction."
    page.save()
    return page


# --------------------------------------------------------------------- users


@pytest.fixture
def managed_permissions(db):
    permissions = Permission.objects.none()
    for app_label, model in MANAGED_MODELS:
        permissions = permissions | Permission.objects.filter(
            content_type__app_label=app_label, content_type__model=model
        )
    return permissions


def _make_staff_user(email, group_name, site, permissions):
    group, _ = Group.objects.get_or_create(name=group_name)
    group.permissions.set(permissions)
    user = User.objects.create_user(
        username=email, email=email, password=PASSWORD, is_staff=True
    )
    user.groups.add(group)
    UserProfile.objects.create(user=user, site=site)
    return user


@pytest.fixture
def alex_admin_user(alex_site, managed_permissions):
    return _make_staff_user(
        "alex_admin@example.com", "alexandra_admin", alex_site, managed_permissions
    )


@pytest.fixture
def roam_editor_user(roam_site, managed_permissions):
    return _make_staff_user(
        "roam_editor@example.com", "roam_editors", roam_site, managed_permissions
    )


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        username="owner", email="owner@example.com", password=PASSWORD
    )


# ------------------------------------------------------------------- clients


@pytest.fixture
def roam_admin_client(client, roam_editor_user):
    client.force_login(roam_editor_user)
    return client


@pytest.fixture
def superuser_client(client, superuser):
    client.force_login(superuser)
    return client
