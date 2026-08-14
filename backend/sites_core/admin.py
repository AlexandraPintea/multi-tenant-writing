from django.contrib import admin

from .models import Site


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ["domain", "name", "default_language", "is_active"]
    list_filter = ["is_active", "default_language"]
    search_fields = ["domain", "name"]
