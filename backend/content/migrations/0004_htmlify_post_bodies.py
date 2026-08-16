"""Convert existing plain-text post bodies to HTML.

Every body written before the field became markup is plain text with
blank-line-separated paragraphs. The reading page now renders the body with
innerHTML, so left alone those posts would collapse into one unbroken slab.

Running the same `clean_body` the save hook uses means the column ends up
uniform — every row is HTML — and no code anywhere needs a "is this one of the
old plain-text ones?" branch.
"""

from django.db import migrations

# Importing live app code into a migration couples this file to a module that
# may change. The alternative is snapshotting the sanitizer here, which would
# then rot in a different way. Deliberate: the conversion should match whatever
# the current allowlist says, and this runs once against a handful of rows.
from content.sanitize import clean_body


def htmlify(apps, schema_editor):
    PostTranslation = apps.get_model("content", "PostTranslation")
    rows = list(PostTranslation.objects.all())
    for row in rows:
        row.body = clean_body(row.body)
    # bulk_update, not save(): the historical model apps.get_model() hands back
    # has no signals attached anyway, and one statement beats N round trips.
    PostTranslation.objects.bulk_update(rows, ["body"], batch_size=200)


def unhtmlify(apps, schema_editor):
    """Deliberately a no-op.

    The original plain text is not recoverable from the HTML — the wrapping is
    lossy in the direction that matters (which newlines were paragraph breaks).
    Reversing the migration leaves the HTML in place, which still renders.
    """


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0003_category_post_category_categorytranslation"),
    ]

    operations = [
        migrations.RunPython(htmlify, unhtmlify),
    ]
