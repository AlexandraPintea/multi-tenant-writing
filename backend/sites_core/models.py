from django.db import models


class Site(models.Model):
    domain = models.CharField(max_length=253, unique=True)
    name = models.CharField(max_length=100)
    # Optional: a site with no logo falls back to its name as a wordmark, which
    # is also what the header shows while the image loads and if it 404s.
    logo = models.ImageField(upload_to="sites/logos/", blank=True)
    default_language = models.CharField(max_length=10, default="en")
    enabled_languages = models.JSONField(default=list)
    theme_config = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["domain"]

    def __str__(self):
        return self.domain
