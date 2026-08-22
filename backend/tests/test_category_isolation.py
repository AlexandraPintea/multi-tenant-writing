"""Category tenant isolation in the admin (A.1, architecture §4.4).

Categories are a second surface with the same leak potential as Post and
Author: the list, the search endpoint, the Post.category dropdown, and the
sidebar filter each resolve their rows independently.
"""

import pytest

from content.models import Category


def changelist(client, url, **params):
    response = client.get(url, params)
    assert response.status_code == 200, f"{url} returned {response.status_code}"
    return response.context_data["cl"]


@pytest.mark.django_db
def test_category_list_is_scoped(roam_admin_client, alex_essay, alex_notes, roam_essay):
    queryset = changelist(roam_admin_client, "/admin/content/category/").queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_essay.pk]


@pytest.mark.django_db
def test_category_search_is_scoped(roam_admin_client, alex_essay, roam_essay):
    """Both tenants own a category slugged 'essay' — search must return one."""
    queryset = changelist(
        roam_admin_client, "/admin/content/category/", q="essay"
    ).queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_essay.pk]


@pytest.mark.django_db
def test_category_dropdown_is_scoped(roam_admin_client, alex_essay, roam_essay):
    response = roam_admin_client.get("/admin/content/post/add/")
    queryset = response.context_data["adminform"].form.fields["category"].queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_essay.pk]


@pytest.mark.django_db
def test_direct_url_to_another_tenants_category_is_refused(
    roam_admin_client, alex_essay
):
    response = roam_admin_client.get(f"/admin/content/category/{alex_essay.pk}/change/")
    assert response.status_code in (302, 404)


@pytest.mark.django_db
def test_sidebar_filter_does_not_enumerate_every_category(
    roam_admin_client, bilingual_post, alex_essay, alex_notes, roam_essay
):
    """A bare "category" in list_filter lists every row in the table; the
    RelatedOnlyFieldListFilter variant derives choices from the scoped
    queryset. Asserted as a count so the intent survives a data change.
    """
    response = roam_admin_client.get("/admin/content/post/")
    changelist_ = response.context_data["cl"]
    category_filter = next(
        f
        for f in changelist_.get_filters(response.wsgi_request)[0]
        if getattr(f, "field_path", "") == "category"
    )
    offered = {
        choice["query_string"].split("category__id__exact=")[-1]
        for choice in category_filter.choices(changelist_)
        if "category__id__exact=" in choice["query_string"]
    }
    assert len(offered) < Category.objects.count()


@pytest.mark.django_db
def test_category_dropdown_narrows_to_the_posts_own_sites(
    superuser_client, bilingual_post, alex_essay, roam_essay, alex_notes
):
    """On a change form the post's sites are known, so the dropdown can be
    narrowed past the user's own scoping — a superuser editing a Roam-only post
    should not be offered alexandrapintea categories."""
    from content.models import Post

    roam_only = Post.objects.create(slug="roam-only")
    roam_only.sites.set([roam_essay.site])

    response = superuser_client.get(f"/admin/content/post/{roam_only.pk}/change/")
    queryset = response.context_data["adminform"].form.fields["category"].queryset
    assert list(queryset.values_list("pk", flat=True)) == [roam_essay.pk]


@pytest.mark.django_db
def test_add_form_falls_back_for_a_superuser(superuser_client, alex_essay, roam_essay):
    """Chicken-and-egg: a new Post has no saved sites, so nothing can narrow
    the dropdown yet. PostAdminForm.clean() is the backstop instead."""
    response = superuser_client.get("/admin/content/post/add/")
    queryset = response.context_data["adminform"].form.fields["category"].queryset
    assert queryset.count() == Category.objects.count()
