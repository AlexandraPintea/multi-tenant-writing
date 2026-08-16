"""Allowlist sanitizing for author-written post bodies.

The body is markup now: the author writes HTML in the admin — a `<div
class="center">`, a blockquote, a list — and the reading page renders it. That
only works if what reaches the database is already safe, because the frontend
renders it with `[innerHTML]` and every other consumer (the API, a future feed,
an export) would otherwise each have to remember to clean it.

So sanitizing happens once, on the way in, against the allowlist below.
"""

import re

import nh3

# What an essay needs, and nothing that executes: no script, no style, no
# iframe, no event handlers. `div` and `span` are here because the author's
# stated use case is wrapping something in `<div class="center">`.
ALLOWED_TAGS = {
    "p",
    "br",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "em",
    "strong",
    "i",
    "b",
    "a",
    "figure",
    "figcaption",
    "img",
    "div",
    "span",
    "hr",
}

# Deliberately a subset of what Angular's own sanitizer permits, because the
# frontend renders this with [innerHTML] and sanitizes again. Anything allowed
# here but stripped there would show up in the admin, survive the API, and then
# vanish in the browser with no explanation — the worst thing to debug.
#
# So: `class` yes (Angular keeps it, and `<div class="center">` is the whole
# point). `style`, `id` and `data-*` no — Angular drops all three.
ALLOWED_ATTRIBUTES = {
    "*": {"class"},
    # No "rel" here on purpose: nh3 refuses to allowlist it while link_rel is
    # set, because it writes the attribute itself on every link.
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
}

# No javascript:, no data: — an <img src="data:..."> is a way to smuggle SVG,
# and SVG can carry script.
ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}

# A block that *starts* with one of these is already markup and is left alone.
# Anchored per block rather than searched across the whole body: one <div>
# somewhere must not stop the prose around it from becoming paragraphs.
# <br> is deliberately absent — text with a line break in it is still text.
_BLOCK_START = re.compile(
    r"<\s*(p|div|h[1-6]|ul|ol|li|blockquote|figure|hr|table|section|article|pre)\b",
    re.IGNORECASE,
)

_BLANK_LINE = re.compile(r"\n\s*\n")


def paragraphs_to_html(body: str) -> str:
    """Give blank-line-separated prose real `<p>` tags, block by block.

    Every body written before this field became markup is plain text, and so is
    anything the author types without thinking about tags — through innerHTML
    that would collapse into one unbroken slab. Promoting it on the way in beats
    a "is this one legacy?" branch at render time, forever.

    Only ever adds `<p>` and `<br>`; never removes anything.
    """
    blocks = []
    for block in _BLANK_LINE.split(body.replace("\r\n", "\n").replace("\r", "\n")):
        stripped = block.strip()
        if not stripped:
            continue
        if _BLOCK_START.match(stripped):
            blocks.append(stripped)
        else:
            # Single newlines inside a block are the author's own line breaks —
            # a verse, an address — and HTML would collapse them to spaces.
            blocks.append("<p>" + "<br>\n".join(stripped.split("\n")) + "</p>")
    return "\n\n".join(blocks)


def clean_body(body: str | None) -> str:
    """Sanitize a post body, then give plain prose real paragraphs.

    Sanitize *first*, wrap second. Reversed, the block-tag probe would be
    reading untrusted input and could be fooled by something like `<scr<p>ipt>`;
    this way it only ever inspects markup nh3 has already parsed, allowlisted
    and re-serialized, and the wrapping step can only add <p> and <br>.

    Runs on every save (see the pre_save receiver in content/models.py) and again
    in the migration that converts old plain-text bodies, so it must be
    idempotent: cleaning clean HTML has to be a no-op, or every save would
    rewrite the row.
    """
    if not body or not body.strip():
        # Whitespace in, empty out — load-bearing for the publishing rule, which
        # tests `translation.body.strip()`. A body of "   " coming back as
        # "<p>   </p>" would make an empty post publishable.
        return ""

    cleaned = nh3.clean(
        body,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        # Any target="_blank" the author writes gets this for free: without
        # noopener the destination page can reach back through window.opener.
        link_rel="noopener noreferrer",
    )
    return paragraphs_to_html(cleaned)
