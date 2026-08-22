from django.contrib import admin
from django.utils import timezone
from parler.admin import TranslatableAdmin
from parler.forms import TranslatableModelForm

from admin_scoped.admin import SiteScopedAdmin

from .models import Category, Comment, ContactMessage, Page, Post


class PostAdminForm(TranslatableModelForm):
    """Enforces the Author/Site rules where a creation can actually be caught.

    Post.clean() can only check saved rows — on a new Post the M2M selections
    live here in cleaned_data, not on the instance — so the real admin-side
    enforcement is this form.

    TranslatableModelForm, not a plain ModelForm: setting `form` on a
    TranslatableAdmin replaces parler's default, and title/body/excerpt are not
    model fields on Post, so `fields = "__all__"` alone would silently drop
    them from the add/change form.
    """

    class Meta:
        model = Post
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        sites = cleaned_data.get("sites")

        if sites is not None:
            self._check_publishable(cleaned_data, sites)

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

    def _check_publishable(self, cleaned_data, sites):
        """The §4.3 publishing rule, for the language tab being edited.

        Publication lives on the translation now, so this form only ever sees
        one language's flag — `self.language_code`, whichever tab is open. That
        is enough: Post.clean() re-checks the copies already in the database,
        and the one about to join them is the one in front of us.

        A blank title or body needs no check here. Both are required model
        fields, so the field-level validation has already rejected them (and
        Django strips whitespace, so a body of spaces counts as blank) before
        this method is reached.
        """
        if not cleaned_data.get("is_published"):
            return

        language = self.language_code
        enabled = {lang for site in sites for lang in site.enabled_languages}
        if language not in enabled:
            self.add_error(
                "is_published",
                f"No site this post publishes to enables {language} "
                f"({sorted(enabled) or 'no sites selected'}), so nobody would "
                "be able to read that copy.",
            )


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
        "published_in",
        "published_at",
    ]
    # RelatedOnlyFieldListFilter, not a bare "category": the default filter
    # enumerates *every* Category row, which would list the other tenant's
    # labels in a Roam editor's sidebar. The related-only variant builds its
    # choices from model_admin.get_queryset(request), which is already scoped.
    list_filter = [
        # Across the translations join, because that is where publication lives
        # now. Django adds its own DISTINCT for a to-many lookup, so a post
        # published in both languages still appears once.
        "translations__is_published",
        "sites",
        ("category", admin.RelatedOnlyFieldListFilter),
    ]
    search_fields = ["slug", "translations__title"]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            # translations: the "Published in" column reads every copy's flag,
            # which without this is one query per row.
            .prefetch_related("authors__site", "translations")
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

    @admin.display(description="Published in")
    def published_in(self, obj):
        """Which languages are live, since one boolean no longer says it.

        The column a checkbox used to be: "EN" means the English copy is out and
        the Romanian one is still being written, which is the state this whole
        change exists to allow.
        """
        return ", ".join(lang.upper() for lang in obj.published_languages()) or "—"

    def author_names(self, obj):
        return (
            ", ".join(f"{a.name} ({a.site.domain})" for a in obj.authors.all()) or "—"
        )

    author_names.short_description = "Authors"


@admin.register(Comment)
class CommentAdmin(SiteScopedAdmin, admin.ModelAdmin):
    """The moderation queue: nothing a reader writes reaches a page unapproved.

    Everything is read-only. A moderator's job here is to approve or delete —
    editing someone else's words while their name stays on them is not a
    feature, and read-only also keeps the post FK out of the form entirely,
    which matters: "post" is deliberately absent from
    SiteScopedAdmin.site_scoped_relations, because that machinery narrows a
    relation with filter(site=...) and Post reaches Site through `sites`.
    """

    site_field = "site"

    list_display = ["created_at", "name", "post", "site", "is_approved", "preview"]
    list_filter = ["is_approved", ("post", admin.RelatedOnlyFieldListFilter)]
    search_fields = ["name", "body"]
    date_hierarchy = "created_at"
    actions = ["approve_comments", "unapprove_comments"]
    readonly_fields = [
        "post",
        "site",
        "language_code",
        "name",
        "body",
        "created_at",
        "approved_at",
    ]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("post", "site")

    @admin.display(description="Comment")
    def preview(self, obj):
        return obj.body[:80] + ("…" if len(obj.body) > 80 else "")

    @admin.action(description="Approve selected comments")
    def approve_comments(self, request, queryset):
        # queryset arrives already narrowed by get_queryset, so a hand-crafted
        # POST naming another tenant's comment ids cannot reach this.
        updated = queryset.update(is_approved=True, approved_at=timezone.now())
        self.message_user(request, f"{updated} comment(s) approved.")

    @admin.action(description="Hide selected comments")
    def unapprove_comments(self, request, queryset):
        updated = queryset.update(is_approved=False, approved_at=None)
        self.message_user(request, f"{updated} comment(s) hidden.")


@admin.register(ContactMessage)
class ContactMessageAdmin(SiteScopedAdmin, admin.ModelAdmin):
    """The contact inbox. Read, mark handled, delete — never edit.

    Everything is read-only for the same reason as comments: these are someone
    else's words and details, and the only useful actions are triage and
    deletion. Deletion matters more here than elsewhere — it is the mechanism
    behind "please remove my details".
    """

    site_field = "site"

    list_display = [
        "created_at",
        "first_name",
        "last_name",
        "email",
        "consented_to_updates",
        "is_handled",
    ]
    # Filterable because "who am I allowed to email?" is the question this
    # table has to answer before any newsletter goes out.
    list_filter = ["consented_to_updates", "is_handled"]
    search_fields = ["first_name", "last_name", "email"]
    date_hierarchy = "created_at"
    actions = ["mark_handled", "mark_unhandled"]
    readonly_fields = [
        "site",
        "first_name",
        "last_name",
        "email",
        "language_code",
        "consented_to_updates",
        "consented_at",
        "consent_text",
        "created_at",
    ]

    @admin.action(description="Mark as handled")
    def mark_handled(self, request, queryset):
        updated = queryset.update(is_handled=True)
        self.message_user(request, f"{updated} message(s) marked handled.")

    @admin.action(description="Mark as not handled")
    def mark_unhandled(self, request, queryset):
        updated = queryset.update(is_handled=False)
        self.message_user(request, f"{updated} message(s) marked unhandled.")


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
