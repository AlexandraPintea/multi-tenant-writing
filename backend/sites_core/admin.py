from django.contrib import admin

from .models import Site


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ["domain", "name", "has_logo", "default_language", "is_active"]
    list_filter = ["is_active", "default_language"]
    search_fields = ["domain", "name"]

    @admin.display(boolean=True, description="Logo")
    def has_logo(self, obj):
        return bool(obj.logo)
