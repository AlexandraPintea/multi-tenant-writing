"""SiteScopedAdmin — the tenant boundary (architecture §3.3, risk row in §9).

These are the highest-stakes tests in the suite: a regression here does not
break a page, it shows one tenant another tenant's unpublished work.

They assert on the queryset each admin view actually renders
(response.context_data["cl"].queryset) rather than on scraped HTML, so a
template change cannot make a leak look like a pass.
"""

import pytest


def changelist(client, url, **params):
    response = client.get(url, params)
    assert response.status_code == 200, f"{url} returned {response.status_code}"
    return response.context_data["cl"]


# ------------------------------------------------------------ the roam editor


@pytest.mark.django_db
def test_post_list_hides_the_other_tenants_post(
    roam_admin_client, bilingual_post, english_only_post
):
    """Roam sees the cross-posted piece, not the alexandrapintea-only one."""
    slugs = set(
        changelist(roam_admin_client, "/admin/content/post/").queryset.values_list(
            "slug", flat=True
        )
    )
    assert slugs == {"the-power-of-words"}


@pytest.mark.django_db
def test_author_list_is_scoped(roam_admin_client, alex_author, roam_author):
    queryset = changelist(roam_admin_client, "/admin/people/author/").queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_author.pk]


@pytest.mark.django_db
def test_page_list_is_scoped(roam_admin_client, alex_page):
    assert changelist(roam_admin_client, "/admin/content/page/").queryset.count() == 0


@pytest.mark.django_db
def test_search_cannot_surface_the_other_tenants_post(
    roam_admin_client, english_only_post
):
    """Scoping must survive the search box, not just the default list."""
    queryset = changelist(
        roam_admin_client, "/admin/content/post/", q="margins"
    ).queryset
    assert queryset.count() == 0


@pytest.mark.django_db
def test_author_search_is_scoped(roam_admin_client, alex_author, roam_author):
    queryset = changelist(
        roam_admin_client, "/admin/people/author/", q="Alexandra"
    ).queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_author.pk]


@pytest.mark.django_db
def test_authors_widget_offers_only_this_tenants_profiles(
    roam_admin_client, alex_author, roam_author
):
    """The M2M widget needs its own override — the FK hook never sees it."""
    response = roam_admin_client.get("/admin/content/post/add/")
    queryset = response.context_data["adminform"].form.fields["authors"].queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_author.pk]


@pytest.mark.django_db
def test_sites_widget_offers_only_this_tenant(roam_admin_client, alex_site, roam_site):
    """Otherwise a Roam editor could publish onto alexandrapintea.eu."""
    response = roam_admin_client.get("/admin/content/post/add/")
    queryset = response.context_data["adminform"].form.fields["sites"].queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_site.pk]


@pytest.mark.django_db
def test_author_site_dropdown_is_scoped(roam_admin_client, alex_site, roam_site):
    response = roam_admin_client.get("/admin/people/author/add/")
    queryset = response.context_data["adminform"].form.fields["site"].queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_site.pk]


@pytest.mark.django_db
def test_site_filter_is_hidden_from_scoped_users(roam_admin_client, roam_site):
    """Its dropdown enumerates every Site by domain — useless here, and a leak."""
    assert (
        "sites" not in changelist(roam_admin_client, "/admin/content/post/").list_filter
    )


@pytest.mark.django_db
def test_direct_url_to_another_tenants_post_is_refused(
    roam_admin_client, english_only_post
):
    """Hiding a row from the list is worthless if the change form still opens."""
    response = roam_admin_client.get(
        f"/admin/content/post/{english_only_post.pk}/change/"
    )
    assert response.status_code in (302, 404)


@pytest.mark.django_db
def test_direct_url_to_another_tenants_author_is_refused(
    roam_admin_client, alex_author
):
    response = roam_admin_client.get(f"/admin/people/author/{alex_author.pk}/change/")
    assert response.status_code in (302, 404)


@pytest.mark.django_db
def test_scoping_ignores_the_host_header(
    roam_admin_client, bilingual_post, english_only_post
):
    """Admin scoping comes from the user's profile, not the request's Host.

    A Roam editor visiting alexandrapintea.eu/admin/ is still a Roam editor.
    """
    changelist_ = changelist(roam_admin_client, "/admin/content/post/", **{})
    assert set(changelist_.queryset.values_list("slug", flat=True)) == {
        "the-power-of-words"
    }


@pytest.mark.django_db
def test_staff_user_without_a_profile_sees_nothing(
    client, django_user_model, managed_permissions, bilingual_post
):
    """Fail closed: no tenant means no rows, never the unscoped queryset."""
    from django.contrib.auth.models import Group

    group, _ = Group.objects.get_or_create(name="orphans")
    group.permissions.set(managed_permissions)
    user = django_user_model.objects.create_user(
        username="orphan@example.com", password="x", is_staff=True
    )
    user.groups.add(group)
    client.force_login(user)

    assert changelist(client, "/admin/content/post/").queryset.count() == 0


# --------------------------------------------------------------- the superuser


@pytest.mark.django_db
def test_superuser_sees_every_tenant(
    superuser_client, bilingual_post, english_only_post
):
    slugs = set(
        changelist(superuser_client, "/admin/content/post/").queryset.values_list(
            "slug", flat=True
        )
    )
    assert slugs == {"the-power-of-words", "writing-in-the-margins"}


@pytest.mark.django_db
def test_superuser_keeps_both_publish_targets(superuser_client, alex_site, roam_site):
    response = superuser_client.get("/admin/content/post/add/")
    queryset = response.context_data["adminform"].form.fields["sites"].queryset
    assert set(queryset.values_list("pk", flat=True)) == {alex_site.pk, roam_site.pk}


@pytest.mark.django_db
def test_superuser_keeps_the_site_filter(superuser_client, alex_site):
    assert "sites" in changelist(superuser_client, "/admin/content/post/").list_filter
