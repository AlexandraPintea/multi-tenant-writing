"""The post body is author-written HTML, cleaned against an allowlist on save.

Two things are under test: the pure function, and the fact that it is actually
wired to every write. The second matters more — a sanitizer nothing calls is the
failure mode this file exists to prevent.
"""

import pytest

from content.models import Post
from content.sanitize import clean_body


class TestCleanBody:
    def test_script_is_removed_along_with_its_contents(self):
        # Not just the tag: a stripped <script> that left "alert(1)" behind as
        # prose would be safe but absurd.
        cleaned = clean_body("<p>hi</p><script>alert(1)</script>")
        assert "script" not in cleaned
        assert "alert(1)" not in cleaned

    def test_a_div_with_a_class_survives(self):
        # The stated reason this feature exists.
        assert (
            clean_body('<div class="center">10</div>') == '<div class="center">10</div>'
        )

    def test_event_handlers_are_stripped_but_the_element_stays(self):
        assert clean_body('<p onclick="steal()">text</p>') == "<p>text</p>"

    def test_javascript_urls_are_dropped(self):
        cleaned = clean_body('<a href="javascript:alert(1)">x</a>')
        assert "javascript" not in cleaned
        assert ">x<" in cleaned

    def test_outbound_links_get_noopener(self):
        # Without it a target="_blank" destination can reach back through
        # window.opener. nh3 writes it on every link rather than only those.
        assert 'rel="noopener noreferrer"' in clean_body(
            '<a href="https://x.test">x</a>'
        )

    @pytest.mark.parametrize("attribute", ['style="color:red"', 'id="x"', 'data-x="1"'])
    def test_attributes_angular_would_strip_are_stripped_here_too(self, attribute):
        # Deliberately a subset of Angular's own allowlist. Anything permitted
        # here but dropped there would survive the admin and the API, then
        # vanish in the browser with nothing to explain why.
        assert clean_body(f"<p {attribute}>t</p>") == "<p>t</p>"

    def test_the_prose_tags_all_survive(self):
        source = (
            "<h2>Heading</h2>"
            "<ul><li>one</li></ul>"
            "<blockquote>quoted</blockquote>"
            "<p><em>em</em> <strong>strong</strong></p>"
            '<figure><img src="/media/x.jpg" alt="x">'
            "<figcaption>cap</figcaption></figure>"
        )
        cleaned = clean_body(source)
        for tag in (
            "h2",
            "ul",
            "li",
            "blockquote",
            "em",
            "strong",
            "figure",
            "img",
            "figcaption",
        ):
            assert f"<{tag}" in cleaned

    def test_h1_is_not_allowed(self):
        # The page already renders the title as its h1; a second one is an
        # accessibility and SEO regression on the page SSR exists to serve.
        assert "<h1" not in clean_body("<h1>big</h1>")

    def test_plain_text_becomes_paragraphs(self):
        assert clean_body("First.\n\nSecond.") == "<p>First.</p>\n\n<p>Second.</p>"

    def test_single_newlines_inside_a_block_become_breaks(self):
        # A verse, an address: the author's own line breaks, which HTML would
        # otherwise collapse into spaces.
        assert "<br>" in clean_body("Line one\nLine two")

    def test_prose_around_a_block_element_is_still_wrapped(self):
        # The mixed case. Deciding "is this markup?" for the whole body would
        # leave this prose bare, because of the one div in the middle.
        cleaned = clean_body('Intro.\n\n<div class="center">10</div>\n\nAfter.')
        assert (
            cleaned == '<p>Intro.</p>\n\n<div class="center">10</div>\n\n<p>After.</p>'
        )

    def test_whitespace_only_bodies_come_back_empty(self):
        # Load-bearing for the publishing rule, which tests body.strip(): a
        # body of "   " returned as "<p>   </p>" would make an empty post
        # publishable. See tests/test_publishing_rule.py.
        assert clean_body("   ") == ""
        assert clean_body("") == ""
        assert clean_body(None) == ""

    def test_cleaning_is_idempotent(self):
        # Both the save hook and the 0004 data migration apply it, and a save
        # that rewrote the row every time would be its own kind of bug.
        source = 'Intro.\n\n<div class="center">10</div>\n\n<p>Done &amp; dusted.</p>'
        once = clean_body(source)
        assert clean_body(once) == once


@pytest.mark.django_db
class TestSanitizingIsWired:
    def test_a_body_saved_through_the_model_is_cleaned(self, alex_site):
        post = Post.objects.create(slug="wired")
        post.sites.set([alex_site])
        post.set_current_language("en")
        post.title = "Wired"
        post.body = "<p>ok</p><script>alert(1)</script>"
        post.save()

        stored = Post.objects.get(pk=post.pk)
        stored.set_current_language("en")
        assert "script" not in stored.body
        assert "<p>ok</p>" in stored.body

    def test_every_language_of_one_save_is_cleaned(self, alex_site):
        # parler writes each cached translation on save; a hook that only saw
        # the "current" language would clean one and store the other verbatim.
        post = Post.objects.create(slug="wired-bilingual")
        post.sites.set([alex_site])
        for language, body in (
            ("en", "<b>en</b><script>x</script>"),
            ("ro", "<script>y</script>ro"),
        ):
            post.set_current_language(language)
            post.title = language
            post.body = body
        post.save()

        stored = Post.objects.get(pk=post.pk)
        for language in ("en", "ro"):
            stored.set_current_language(language)
            assert "script" not in stored.body
