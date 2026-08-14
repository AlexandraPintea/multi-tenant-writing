from django.core.exceptions import ValidationError
from django.db import models
from parler.models import TranslatableModel, TranslatedFields


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
