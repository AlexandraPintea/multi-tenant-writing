from django.db import models


class Site(models.Model):
    domain = models.CharField(max_length=253, unique=True)
    name = models.CharField(max_length=100)
    default_language = models.CharField(max_length=10, default="en")
    enabled_languages = models.JSONField(default=list)
    theme_config = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["domain"]

    def __str__(self):
        return self.domain