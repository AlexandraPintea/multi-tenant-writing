"""Move publication from the Post to each of its translations.

One flag on the post could only ever mean "all languages at once", so a piece
that was finished in English and half-written in Romanian had to wait for the
Romanian before either could go out. The flag belongs where the copy it governs
lives.

Existing rows carry their post's flag into every translation they have, which
keeps the site rendering exactly what it rendered before this migration ran.

The rename is not decoration. Parler refuses to attach a translated field whose
name a master model already uses, and every operation here renders the models
of the state it runs against — so a state where both Post and PostTranslation
carry `is_published` cannot be built at all, not even in passing. Renaming the
old column out of the way first keeps the value readable while the new one is
added, and leaves every intermediate state legal.
"""

from django.db import migrations, models


def carry_publication_into_translations(apps, schema_editor):
    PostTranslation = apps.get_model("content", "PostTranslation")
    rows = list(PostTranslation.objects.select_related("master"))
    for row in rows:
        row.is_published = row.master.legacy_is_published
    PostTranslation.objects.bulk_update(rows, ["is_published"], batch_size=200)


def carry_publication_back_to_posts(apps, schema_editor):
    """Reverse: a post is published if any of its copies was.

    Lossy, and in the safe direction — going back cannot know which language
    the editor had switched off, and treating a partly-published post as a
    draft would unpublish live writing.
    """
    Post = apps.get_model("content", "Post")
    posts = list(Post.objects.prefetch_related("translations"))
    for post in posts:
        post.legacy_is_published = any(t.is_published for t in post.translations.all())
    Post.objects.bulk_update(posts, ["legacy_is_published"], batch_size=200)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0009_page_image_pagetranslation_image_alt"),
    ]

    operations = [
        migrations.RenameField(
            model_name="post",
            old_name="is_published",
            new_name="legacy_is_published",
        ),
        migrations.AddField(
            model_name="posttranslation",
            name="is_published",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.RunPython(
            carry_publication_into_translations,
            carry_publication_back_to_posts,
        ),
        migrations.RemoveField(
            model_name="post",
            name="legacy_is_published",
        ),
    ]
