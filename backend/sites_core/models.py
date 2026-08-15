from django.db import models


class Site(models.Model):
    domain = models.CharField(max_length=253, unique=True)
    name = models.CharField(max_length=100)
    # Optional: a site with no logo falls back to its name as a wordmark, which
    # is also what the header shows while the image loads and if it 404s.
    logo = models.ImageField(upload_to="sites/logos/", blank=True)
    # {"email": "hello@example.com", "instagram": "https://instagram.com/..."}.
    # Free-form keys rather than a column per network: adding Bluesky should be
    # an edit in the admin, not a migration. The footer renders whatever is here,
    # in insertion order.
    social_links = models.JSONField(default=dict, blank=True)
    # Blank means "© <current year> <name>", computed at render time so it does
    # not silently go stale on New Year's Day.
    copyright_text = models.CharField(max_length=200, blank=True)
    default_language = models.CharField(max_length=10, default="en")
    enabled_languages = models.JSONField(default=list)
    theme_config = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["domain"]

    def __str__(self):
        return self.domain
