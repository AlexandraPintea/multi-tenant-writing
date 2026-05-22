from django.apps import AppConfig


class AdminScopedConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "admin_scoped"
