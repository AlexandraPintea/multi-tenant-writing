from django.conf import settings
from django.db import models
from parler.models import TranslatableModel, TranslatedFields


class Author(TranslatableModel):
    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="authors",
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200)
    location = models.CharField(max_length=200, blank=True)
    portrait = models.ImageField(upload_to="authors/portraits/", blank=True)
    social_links = models.JSONField(default=dict, blank=True)

    translations = TranslatedFields(
        bio=models.TextField(blank=True),
    )

    class Meta:
        unique_together = [("site", "slug")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.site.domain})"


class UserProfile(models.Model):
    """Binds a staff account to the one Site it may administer.

    Kept separate from Author: an Author is public content, a UserProfile is an
    access-control record, and the two do not map one-to-one (the owner has one
    login but an Author row on each site).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    site = models.ForeignKey(
        "sites_core.Site",
        on_delete=models.CASCADE,
        related_name="user_profiles",
    )

    def __str__(self):
        return f"{self.user} → {self.site.domain}"
