"""Convert existing plain-text page content to HTML.

The same conversion migration 0004 did for post bodies, now that Page.content
is rendered as markup as well. The About pages were written as plain text and
would otherwise collapse into one unbroken slab.
"""

from django.db import migrations

from content.sanitize import clean_body


def htmlify(apps, schema_editor):
    PageTranslation = apps.get_model("content", "PageTranslation")
    rows = list(PageTranslation.objects.all())
    for row in rows:
        row.content = clean_body(row.content)
    PageTranslation.objects.bulk_update(rows, ["content"], batch_size=200)


def unhtmlify(apps, schema_editor):
    """No-op: which newlines were paragraph breaks is not recoverable."""


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0007_remove_contactmessage_phone_and_more"),
    ]

    operations = [
        migrations.RunPython(htmlify, unhtmlify),
    ]
