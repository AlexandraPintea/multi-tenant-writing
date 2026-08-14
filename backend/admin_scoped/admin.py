from django.contrib import admin

from sites_core.models import Site


class SiteScopedAdmin(admin.ModelAdmin):
    """Confine every admin surface of a model to the editing user's Site.

    Superusers bypass scoping entirely (architecture §3.3). A staff user with no
    UserProfile has no tenant and is shown nothing: failing closed is the only
    safe default, since the alternative — falling through to the unscoped
    queryset — is a silent cross-tenant leak.

    ``get_queryset`` is the load-bearing override. Besides list views it also
    backs ``get_object`` (so a hand-typed change-form URL for another tenant's
    row 404s), the admin search box, and Django's autocomplete endpoint, which
    calls ``get_queryset`` on the *target* model's admin — meaning autocomplete
    is covered for free as long as that admin also uses this mixin.
    """

    # Lookup from this model to Site. Overridden to "sites" on Post, which
    # reaches Site through an M2M rather than an FK.
    site_field = "site"

    # Relation fields whose choices must be narrowed to the user's Site.
    site_scoped_relations = ("site", "sites", "author", "authors", "category")

    def _user_site(self, request):
        profile = getattr(request.user, "profile", None)
        return getattr(profile, "site", None)

    def _needs_scoping(self, request, db_field):
        return (
            not request.user.is_superuser
            and db_field.name in self.site_scoped_relations
        )

    def _scoped_relation_queryset(self, db_field, request):
        related = db_field.remote_field.model
        site = self._user_site(request)
        if site is None:
            return related._default_manager.none()
        if related is Site:
            return related._default_manager.filter(pk=site.pk)
        return related._default_manager.filter(site=site)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        site = self._user_site(request)
        if site is None:
            return qs.none()
        return qs.filter(**{self.site_field: site})

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if self._needs_scoping(request, db_field):
            kwargs["queryset"] = self._scoped_relation_queryset(db_field, request)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        # Post.sites is M2M, so the ForeignKey hook never sees it. Without this
        # override a Roam editor gets an alexandrapintea.eu checkbox in the
        # publish-targets widget and can push a post onto the other tenant.
        if self._needs_scoping(request, db_field):
            kwargs["queryset"] = self._scoped_relation_queryset(db_field, request)
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    def get_list_filter(self, request):
        list_filter = super().get_list_filter(request)
        if request.user.is_superuser:
            return list_filter
        # The site filter enumerates every Site by domain in the sidebar. For a
        # scoped user it selects nothing new and discloses the other tenant.
        return tuple(f for f in list_filter if f not in ("site", "sites"))
