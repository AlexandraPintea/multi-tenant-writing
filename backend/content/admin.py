from django.contrib import admin
from parler.admin import TranslatableAdmin

from admin_scoped.admin import SiteScopedAdmin

from .models import Page, Post


@admin.register(Post)
class PostAdmin(SiteScopedAdmin, TranslatableAdmin):
    # Post reaches Site through the publish-targets M2M, not an FK.
    site_field = "sites"

    list_display = ["safe_title", "author", "is_published", "published_at"]
    list_filter = ["is_published", "sites"]
    search_fields = ["slug", "translations__title"]

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"


@admin.register(Page)
class PageAdmin(SiteScopedAdmin, TranslatableAdmin):
    list_display = ["safe_title", "site", "slug"]
    list_filter = ["site"]
    search_fields = ["slug", "translations__title"]

    def safe_title(self, obj):
        return obj.safe_translation_getter("title", any_language=True) or obj.slug

    safe_title.short_description = "Title"
