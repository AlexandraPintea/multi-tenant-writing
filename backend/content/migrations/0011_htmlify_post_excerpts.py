"""Convert existing plain-text excerpts to HTML.

Same reasoning as 0004 did for bodies: the excerpt is markup from now on and the
card renders it with innerHTML, so a row left as plain text would lose its
paragraph breaks. Running the same `clean_body` the save hook runs leaves the
column uniform, with no "is this one of the old ones?" branch anywhere.
"""

from django.db import migrations

from content.sanitize import clean_body


def htmlify(apps, schema_editor):
    PostTranslation = apps.get_model("content", "PostTranslation")
    rows = list(PostTranslation.objects.all())
    for row in rows:
        row.excerpt = clean_body(row.excerpt)
    PostTranslation.objects.bulk_update(rows, ["excerpt"], batch_size=200)


def unhtmlify(apps, schema_editor):
    """A no-op, as in 0004: the wrapping is not reversible, and the HTML still
    renders as an excerpt if this migration is rolled back."""


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0010_per_language_publishing"),
    ]

    operations = [
        migrations.RunPython(htmlify, unhtmlify),
    ]
