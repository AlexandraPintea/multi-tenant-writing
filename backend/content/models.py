from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.signals import pre_save
from django.dispatch import receiver
from parler.models import TranslatableModel, TranslatedFields

from .sanitize import clean_body


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
