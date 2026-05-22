from django.contrib import admin
from parler.admin import TranslatableAdmin

from .models import Author


@admin.register(Author)
class AuthorAdmin(TranslatableAdmin):
    list_display = ["name", "site", "location"]
    list_filter = ["site"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}