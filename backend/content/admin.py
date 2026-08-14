from django import forms
from django.contrib import admin
from parler.admin import TranslatableAdmin

from admin_scoped.admin import SiteScopedAdmin

from .models import Category, Page, Post


class PostAdminForm(forms.ModelForm):
    """Enforces the Author/Site rules where a creation can actually be caught.

    Post.clean() can only check saved rows — on a new Post the M2M selections
    live here in cleaned_data, not on the instance — so the real admin-side
    enforcement is this form.
    """

    class Meta:
        model = Post
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        sites = cleaned_data.get("sites")
        authors = cleaned_data.get("authors")
        if sites is None or authors is None:
            return cleaned_data

        site_ids = {site.pk for site in sites}

        category = cleaned_data.get("category")
        if category is not None and category.site_id not in site_ids:
            self.add_error(
                "category",
                f"{category} belongs to {category.site.domain}, which is not "
                "one of this post's target sites.",
            )

        seen_sites = set()
        for author in authors:
            if author.site_id not in site_ids:
                self.add_error(
                    "authors",
                    f"{author.name} belongs to {author.site.domain}, which is "
                    "not one of this post's target sites.",
                )
            elif author.site_id in seen_sites:
                self.add_error(
                    "authors",
                    f"More than one author for {author.site.domain}. A post "
                    "carries at most one author per site.",
                )
            seen_sites.add(author.site_id)
        return cleaned_data


@admin.register(Post)
class PostAdmin(SiteScopedAdmin, TranslatableAdmin):
    # Post reaches Site through the publish-targets M2M, not an FK.
    site_field = "sites"

    form = PostAdminForm
    # filter_horizontal, not autocomplete_fields: autocomplete resolves its
    # choices through the *target* model's admin, and SiteAdmin is unscoped, so
    # an autocomplete on `sites` would happily offer the other tenant. The
    # horizontal widget goes through formfield_for_manytomany, which the
    # SiteScopedAdmin mixin narrows.
    filter_horizontal = ["authors", "sites"]

    list_display = [
        "safe_title",
        "author_names",
        "category",
        "is_published",
        "published_at",
    ]
    # RelatedOnlyFieldListFilter, not a bare "category": the default filter
    # enumerates *every* Category row, which would list the other tenant's
    # labels in a Roam editor's sidebar. The related-only variant builds its
    # choices from model_admin.get_queryset(request), which is already scoped.
    list_filter = [
        "is_published",
        "sites",
        ("category", admin.RelatedOnlyFieldListFilter),
    ]
    search_fields = ["slug", "translations__title"]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .prefetch_related("authors__site")
            .select_related("category")
        )

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        formfield = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == "category":
            post = self._post_being_edited(request)
            if post is not None:
                # Narrow further to the sites this post actually publishes to.
                formfield.queryset = formfield.queryset.filter(
                    site__in=post.sites.all()
                )
        return formfield

    def _post_being_edited(self, request):
        """The Post whose change form is rendering, or None on the add form.

        Chicken-and-egg: a brand-new Post has no saved `sites` yet, so there is
        nothing to filter the category dropdown by. On the add form we fall
        back to whatever SiteScopedAdmin allows — the user's own site, or every
        site for a superuser — and PostAdminForm.clean() is the backstop that
        rejects a mismatched pick on save.
        """
        object_id = (request.resolver_match.kwargs or {}).get("object_id")
        if not object_id:
            return None
        return Post.objects.filter(pk=object_id).first()

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"

    def author_names(self, obj):
        return (
            ", ".join(f"{a.name} ({a.site.domain})" for a in obj.authors.all()) or "—"
        )

    author_names.short_description = "Authors"


@admin.register(Category)
class CategoryAdmin(SiteScopedAdmin, TranslatableAdmin):
    list_display = ["safe_name", "site", "slug"]
    list_filter = ["site"]
    search_fields = ["slug", "translations__name"]

    def safe_name(self, obj):
        return obj.safe_translation_getter("name", any_language=True) or obj.slug

    safe_name.short_description = "Name"


@admin.register(Page)
class PageAdmin(SiteScopedAdmin, TranslatableAdmin):
    list_display = ["safe_title", "site", "slug"]
    list_filter = ["site"]
    search_fields = ["slug", "translations__title"]

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"
