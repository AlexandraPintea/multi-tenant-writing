from admin_scoped.admin import SiteScopedAdmin
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from parler.admin import TranslatableAdmin

from .models import Author, UserProfile


@admin.register(Author)
class AuthorAdmin(SiteScopedAdmin, TranslatableAdmin):
    list_display = ["name", "site", "location"]
    list_filter = ["site"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    extra = 0
    verbose_name_plural = "Site access"


class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]


# Editing a user's tenant belongs next to their groups, not in a detached
# UserProfile list — so the profile is an inline on the stock UserAdmin.
admin.site.unregister(User)
admin.site.register(User, UserAdmin)