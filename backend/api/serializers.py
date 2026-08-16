from rest_framework import serializers


class SiteConfigSerializer(serializers.Serializer):
    """Theme + language config for the current Site.

    ``theme_config`` stores CSS custom properties alongside a ``layout`` key;
    we split them so the frontend gets a clean ``theme`` map plus ``layout``.
    """

    domain = serializers.CharField()
    name = serializers.CharField()
    logo = serializers.SerializerMethodField()
    social_links = serializers.JSONField()
    copyright_text = serializers.CharField(allow_blank=True)
    theme = serializers.SerializerMethodField()
    layout = serializers.SerializerMethodField()
    enabled_languages = serializers.ListField(child=serializers.CharField())
    default_language = serializers.CharField()

    def get_logo(self, obj):
        # Root-relative, like every other upload this API serves: nginx puts
        # /media on the same origin in production, and the frontend's mediaUrl
        # re-bases it when the API is elsewhere.
        return obj.logo.url if obj.logo else None

    def get_theme(self, obj):
        return {k: v for k, v in obj.theme_config.items() if k != "layout"}

    def get_layout(self, obj):
        return obj.theme_config.get("layout")


class _TranslatedMixin:
    """Read a parler field in the request language (passed via context).

    The view guarantees the language is present for post bodies (the 404 rule
    runs first), so this is a plain read; for author bios we allow a fallback
    to any available language since bios are not coverage-gated.
    """

    def _lang(self):
        return self.context["lang"]

    def _t(self, obj, field, any_language=False):
        return obj.safe_translation_getter(
            field, language_code=self._lang(), any_language=any_language, default=""
        )


class AuthorBriefSerializer(serializers.Serializer):
    """Author summary embedded in post payloads."""

    name = serializers.CharField()
    slug = serializers.CharField()


class CategorySerializer(_TranslatedMixin, serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.SerializerMethodField()

    def get_name(self, obj):
        # any_language: a label falling back to another language is better than
        # a card rendering a blank chip. The list endpoint filters by language
        # instead; embedded labels degrade rather than disappear.
        return self._t(obj, "name", any_language=True)


class PostListSerializer(_TranslatedMixin, serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.SerializerMethodField()
    excerpt = serializers.SerializerMethodField()
    published_at = serializers.DateTimeField()
    cover_image = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    available_languages = serializers.SerializerMethodField()

    def get_title(self, obj):
        return self._t(obj, "title")

    def get_excerpt(self, obj):
        return self._t(obj, "excerpt")

    def get_cover_image(self, obj):
        return obj.cover_image.url if obj.cover_image else None

    def get_author(self, obj):
        """The Author profile this post appears under on the requesting site.

        A cross-posted piece carries one Author per site, so which one is
        correct depends on who is asking. Null when the writer has no profile
        on this site — that is a legitimate state, not an error.
        """
        author = obj.author_for_site(self.context["site"])
        return AuthorBriefSerializer(author).data if author else None

    def get_category(self, obj):
        """Embedded {slug, name}, or null.

        Embedding the label rather than just the slug costs a few bytes per
        card and saves the frontend a second request purely to resolve names.
        """
        if obj.category_id is None:
            return None
        return CategorySerializer(obj.category, context=self.context).data

    def get_available_languages(self, obj):
        return sorted(obj.get_available_languages())


class PostDetailSerializer(PostListSerializer):
    body = serializers.SerializerMethodField()
    next_post = serializers.SerializerMethodField()

    def get_body(self, obj):
        return self._t(obj, "body")

    def get_next_post(self, obj):
        """The older neighbour, or null on the oldest post.

        Embedded rather than given its own endpoint: SSR waits on whatever the
        resolver dispatches, so a second request would sit on the critical path
        of a page that already has everything else it needs. It also rides the
        existing per-(slug, language) cache for free.

        Declared here and not on PostListSerializer on purpose — that one is
        reused for the author page's post list, where an adjacency query per row
        would be N+1 for a link nobody renders.
        """
        neighbour = obj.next_post_for(self.context["site"], self._lang())
        if neighbour is None:
            return None
        return {"slug": neighbour.slug, "title": self._t(neighbour, "title")}


class AuthorSerializer(_TranslatedMixin, serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()
    location = serializers.CharField()
    social_links = serializers.JSONField()
    portrait = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()

    def get_portrait(self, obj):
        return obj.portrait.url if obj.portrait else None

    def get_bio(self, obj):
        return self._t(obj, "bio", any_language=True)


class AuthorDetailSerializer(AuthorSerializer):
    posts = serializers.SerializerMethodField()

    def get_posts(self, obj):
        return PostListSerializer(
            self.context["author_posts"], many=True, context=self.context
        ).data


class PageSerializer(_TranslatedMixin, serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.SerializerMethodField()
    content = serializers.SerializerMethodField()

    def get_title(self, obj):
        return self._t(obj, "title", any_language=True)

    def get_content(self, obj):
        return self._t(obj, "content", any_language=True)
