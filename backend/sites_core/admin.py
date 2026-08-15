from django.contrib import admin

from .models import Site

# Shown above the footer fields. A fieldset description is the only place in the
# admin that renders *above* its inputs — help_text lands underneath, which is
# too late for a field whose whole difficulty is knowing what to type.
#
# The admin template renders it with |safe, so a plain string is enough — and
# format_html() is actively wrong here, since it would read the JSON example's
# braces as format placeholders. It must stay a static literal for the same
# reason: anything interpolated from user data would be an XSS hole.
SOCIAL_LINKS_HELP = """
<p><strong>Social links</strong> is a JSON object: the key names the network,
the value is where it points.</p>
<pre style="margin:.5em 0;padding:.6em;background:#f6f6f6;border-radius:4px">{
    "email": "hello@alexandrapintea.eu",
    "instagram": "https://instagram.com/alexandrapintea",
    "facebook": "https://facebook.com/alexandrapintea"
}</pre>
<ul style="margin:0;padding-left:1.2em">
    <li><strong>email</strong> may be a bare address &mdash; it becomes a
        <code>mailto:</code> link. Everything else needs the full
        <code>https://</code>, or the browser reads it as a path on this site.</li>
    <li>Icons are chosen from the key: <code>email</code>, <code>instagram</code>,
        <code>facebook</code>, <code>x</code>, <code>threads</code>,
        <code>tiktok</code>, <code>youtube</code>, <code>linkedin</code>,
        <code>substack</code>, <code>mastodon</code> and <code>website</code> have
        their own. <code>twitter</code>, <code>ig</code>, <code>fb</code> and
        <code>mail</code> are understood as aliases. Any other key still works and
        gets a globe.</li>
    <li>The footer decides the order (email and the common networks first), so
        the order you type them in does not matter.</li>
    <li>Leave a value empty and that link is skipped. Leave the whole field as
        <code>{}</code> for no links at all.</li>
</ul>
<p><strong>Copyright text</strong> is optional: blank renders
&copy; &lt;current year&gt; &lt;site name&gt;.</p>
"""


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ["domain", "name", "has_logo", "default_language", "is_active"]
    list_filter = ["is_active", "default_language"]
    search_fields = ["domain", "name"]

    fieldsets = [
        (None, {"fields": ["domain", "name", "logo", "is_active"]}),
        ("Languages", {"fields": ["default_language", "enabled_languages"]}),
        ("Theme", {"fields": ["theme_config"]}),
        (
            "Footer",
            {
                "description": SOCIAL_LINKS_HELP,
                "fields": ["social_links", "copyright_text"],
            },
        ),
    ]

    @admin.display(boolean=True, description="Logo")
    def has_logo(self, obj):
        return bool(obj.logo)
