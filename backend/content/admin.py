from django import forms
from django.contrib import admin
from parler.admin import TranslatableAdmin

from admin_scoped.admin import SiteScopedAdmin

from .models import Page, Post


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

    list_display = ["safe_title", "author_names", "is_published", "published_at"]
    list_filter = ["is_published", "sites"]
    search_fields = ["slug", "translations__title"]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("authors__site")

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"

    def author_names(self, obj):
        return (
            ", ".join(f"{a.name} ({a.site.domain})" for a in obj.authors.all()) or "—"
        )

    author_names.short_description = "Authors"


@admin.register(Page)
class PageAdmin(SiteScopedAdmin, TranslatableAdmin):
    list_display = ["safe_title", "site", "slug"]
    list_filter = ["site"]
    search_fields = ["slug", "translations__title"]

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"
