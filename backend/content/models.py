from django.db import models
from parler.models import TranslatableModel, TranslatedFields


class Post(TranslatableModel):
    author = models.ForeignKey(
        "people.Author",
        on_delete=models.SET_NULL,
        null=True,
        related_name="posts",
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
