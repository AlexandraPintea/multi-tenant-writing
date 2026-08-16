from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.db.models.signals import pre_save
from django.dispatch import receiver
from parler.models import TranslatableModel, TranslatedFields

from .sanitize import clean_body

# How a reader's archive is ordered, everywhere. `nulls_first` is Postgres's own
# behaviour on DESC, written down rather than inherited; `-id` is the tie-break
# Meta.ordering lacks, without which two posts sharing a timestamp have no
# defined order and adjacency becomes a coin toss.
VISIBLE_ORDER = (F("published_at").desc(nulls_first=True), "-id")


class Category(TranslatableModel):
    """Admin-managed label on a Post, rendered as a small chip in v1.

    A real table rather than a free-text field on Post: category tabs in the
    writings list are deferred (requirements §3.4), and normalising the values
    now means adding them later is a UI change with no data cleanup.
    """

    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="categories",
    )
    # Not translated: a slug is an admin-URL convenience and stays
    # language-agnostic, while the label the reader sees does get translated.
    slug = models.SlugField(max_length=200)

    translations = TranslatedFields(
        name=models.CharField(max_length=100),
    )

    class Meta:
        unique_together = [("site", "slug")]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.safe_translation_getter("name", any_language=True) or self.slug


class Post(TranslatableModel):
    # One Author per target site: the per-site profile the piece appears under
    # on that site. A single FK cannot express this, because Author is
    # FK-to-Site while Post is M2M-to-Site (architecture §3.2).
    authors = models.ManyToManyField(
        "people.Author",
        related_name="posts",
        blank=True,
    )
    sites = models.ManyToManyField(
        "sites_core.Site",
        related_name="posts",
    )
    # Nullable in v1: existing rows predate categories and must not block the
    # migration. Tighten to required once the imported content is tidied.
    category = models.ForeignKey(
        "content.Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posts",
    )
    slug = models.SlugField(max_length=200, unique=True)
    cover_image = models.ImageField(upload_to="posts/covers/", blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    is_published = models.BooleanField(default=False, db_index=True)

    translations = TranslatedFields(
        title=models.CharField(max_length=300),
        body=models.TextField(),
        excerpt=models.TextField(blank=True),
    )

    class Meta:
        ordering = ["-published_at"]

    def __str__(self):
        return self.safe_translation_getter("title", any_language=True) or self.slug

    def clean(self):
        """Validate the Author/Site relationship.

        Only runs for saved rows: on an unsaved Post the M2M tables cannot be
        queried, and the admin's ModelForm holds that data in cleaned_data
        rather than on the instance. PostAdminForm and the API serializer
        enforce the same two rules at their own layer, which is where a
        creation actually gets caught.
        """
        if not self.pk:
            return

        site_ids = set(self.sites.values_list("id", flat=True))

        if self.is_published:
            # §4.3: publishable as soon as ONE of the target sites' enabled
            # languages has a complete translation. Not all of them — that is
            # what lets an English-only piece live on a bilingual site.
            enabled = {
                language
                for site in self.sites.all()
                for language in site.enabled_languages
            }
            complete = any(
                translation.language_code in enabled
                and translation.title.strip()
                and translation.body.strip()
                for translation in self.translations.all()
            )
            if not complete:
                raise ValidationError(
                    {
                        "is_published": (
                            "Cannot publish without a title and body in at "
                            "least one language this post's sites enable "
                            f"({sorted(enabled) or 'no sites selected'})."
                        )
                    }
                )

        if self.category_id is not None and self.category.site_id not in site_ids:
            raise ValidationError(
                {
                    "category": (
                        f"{self.category} belongs to {self.category.site.domain}, "
                        "which is not one of this post's target sites."
                    )
                }
            )

        seen_sites = set()
        for author in self.authors.select_related("site"):
            if author.site_id not in site_ids:
                raise ValidationError(
                    {
                        "authors": (
                            f"{author.name} belongs to {author.site.domain}, "
                            "which is not one of this post's target sites."
                        )
                    }
                )
            if author.site_id in seen_sites:
                raise ValidationError(
                    {
                        "authors": (
                            f"More than one author for {author.site.domain}. "
                            "A post carries at most one author per site."
                        )
                    }
                )
            seen_sites.add(author.site_id)

    def author_for_site(self, site):
        """The Author this post appears under on ``site``, or None."""
        for author in self.authors.all():
            if author.site_id == site.id:
                return author
        return None

    @classmethod
    def visible_on(cls, site, lang):
        """The archive a reader of ``lang`` sees on ``site``, newest first.

        The same three filters the list endpoint applies, in one place, because
        "the next post" has to mean "the next one in the list you are reading" —
        and the two drifting apart is the bug that would be hardest to notice.
        """
        return (
            cls.objects.filter(
                sites=site,
                is_published=True,
                translations__language_code=lang,
            )
            .distinct()
            .order_by(*VISIBLE_ORDER)
        )

    def next_post_for(self, site, lang):
        """The next piece down the archive — the older one — or None.

        Adjacency belongs to (post, site, language), not to the post: a
        cross-posted piece has different neighbours on each domain, and a post
        with no translation in this language is not in this archive at all.
        """
        if self.published_at is None:
            # Undated posts sort first, so everything dated is below them; among
            # themselves they fall back to id order.
            older = Q(published_at__isnull=True, id__lt=self.id) | Q(
                published_at__isnull=False
            )
        else:
            # The id half is not decoration: Meta.ordering has no tie-break, so
            # without it two posts sharing a timestamp would each skip or repeat
            # the other depending on which way the database felt.
            older = Q(published_at__lt=self.published_at) | Q(
                published_at=self.published_at, id__lt=self.id
            )

        return self.visible_on(site, lang).exclude(pk=self.pk).filter(older).first()


# Parler keeps translated fields on a sibling model, so the hook belongs there:
# saving a Post writes its translations through this model, and so does
# `post.body = ...; post.save()`, the seeder, the admin and the test fixtures.
PostTranslation = Post._parler_meta.root_model


@receiver(pre_save, sender=PostTranslation)
def _sanitize_post_body(sender, instance, raw=False, **kwargs):
    """Clean the body on every write, not just the ones through the admin form.

    A form's clean_body() would be the obvious home and would be wrong: it only
    ever sees the one language tab being edited, and it would leave the seeder,
    `manage.py shell` and data migrations writing raw HTML into the same column
    the API serves. "What is stored is safe" has to be a property of the column,
    not of one code path.

    `raw` is loaddata replaying a fixture verbatim — rewriting rows mid-load
    would leave the fixture and the database disagreeing about their contents.
    """
    if not raw:
        instance.body = clean_body(instance.body)


class Comment(models.Model):
    """A reader's comment, invisible until a human approves it.

    Not a TranslatableModel: a comment is written once, in whatever language the
    reader was reading, and translating someone else's words would be strange.
    """

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    # Alongside the post, not derived from it. Post.sites is M2M, so "the
    # comments on this post" is ambiguous — a comment belongs to the *rendering*
    # the reader was actually looking at, and a thread left on roamliterary.com
    # has no business appearing on alexandrapintea.eu. Set from request.site in
    # the view, never from the payload.
    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="comments",
    )
    # Recorded, not filtered on: the EN and RO copies of a piece share one URL
    # and one thread, so splitting them would make the conversation vanish when
    # a reader toggles language. Kept because it is moderation context, and
    # because a later decision to split would otherwise need data nobody kept.
    language_code = models.CharField(max_length=10, blank=True)
    name = models.CharField(max_length=80)
    body = models.TextField(max_length=4000)
    is_approved = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Oldest first — a thread reads forward, unlike the archive.
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "site", "is_approved", "created_at"]),
        ]

    def __str__(self):
        return f"{self.name} on {self.post.slug}"

    def clean(self):
        # An admin-created row could otherwise be attached to a site the post is
        # not published on, where it would be invisible and unexplainable.
        if self.post_id and self.site_id:
            if not self.post.sites.filter(pk=self.site_id).exists():
                raise ValidationError(
                    {"site": "This post is not published on that site."}
                )


class ContactMessage(models.Model):
    """Someone leaving their details on the contact page.

    Lives here beside Comment rather than in `people`, which is about authors
    and staff accounts: both of these are things a *reader* submits and a human
    then reads.

    Unlike a comment this is never published anywhere — it exists only in the
    admin. It is also the most personal data the project holds: a name and an
    email address, which the deployment's backups inherit an obligation over.

    No phone number: it was collected and never used, which is exactly the kind
    of field data minimisation is about. Dropped in migration 0007.
    """

    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="contact_messages",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(max_length=254)
    language_code = models.CharField(max_length=10, blank=True)
    # Consent to be emailed updates. Sending marketing without it is what the
    # GDPR and ePrivacy rules actually forbid, so it is stored as evidence
    # rather than assumed from the fact that someone used the form.
    consented_to_updates = models.BooleanField(default=False)
    consented_at = models.DateTimeField(null=True, blank=True)
    # The exact sentence they agreed to. Wording changes over time, and
    # "they consented" is worth little without a record of to what.
    consent_text = models.TextField(blank=True)
    is_handled = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        # Newest first: this is an inbox, not a conversation.
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["site", "is_handled", "created_at"])]

    def __str__(self):
        return f"{self.first_name} {self.last_name} <{self.email}>"


class Page(TranslatableModel):
    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="pages",
    )
    slug = models.SlugField(max_length=200)

    translations = TranslatedFields(
        title=models.CharField(max_length=300),
        content=models.TextField(blank=True),
    )

    class Meta:
        unique_together = [("site", "slug")]
        ordering = ["slug"]

    def __str__(self):
        return self.safe_translation_getter("title", any_language=True) or self.slug


# Page content is markup too, from the moment the privacy notice needed
# headings and lists instead of one slab of prose. Same hook, same allowlist,
# same reason it is not in a form: the seeder writes these pages as well.
PageTranslation = Page._parler_meta.root_model


@receiver(pre_save, sender=PageTranslation)
def _sanitize_page_content(sender, instance, raw=False, **kwargs):
    if not raw:
        instance.content = clean_body(instance.content)
