from rest_framework import serializers


class SiteConfigSerializer(serializers.Serializer):
    """Theme + language config for the current Site.

    ``theme_config`` stores CSS custom properties alongside a ``layout`` key;
    we split them so the frontend gets a clean ``theme`` map plus ``layout``.
    """

    domain = serializers.CharField()
    name = serializers.CharField()
    theme = serializers.SerializerMethodField()
    layout = serializers.SerializerMethodField()
    enabled_languages = serializers.ListField(child=serializers.CharField())
    default_language = serializers.CharField()

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


class PostListSerializer(_TranslatedMixin, serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.SerializerMethodField()
    excerpt = serializers.SerializerMethodField()
    published_at = serializers.DateTimeField()
    cover_image = serializers.SerializerMethodField()
    author = AuthorBriefSerializer()
    available_languages = serializers.SerializerMethodField()

    def get_title(self, obj):
        return self._t(obj, "title")

    def get_excerpt(self, obj):
        return self._t(obj, "excerpt")

    def get_cover_image(self, obj):
        return obj.cover_image.url if obj.cover_image else None

    def get_available_languages(self, obj):
        return sorted(obj.get_available_languages())


class PostDetailSerializer(PostListSerializer):
    body = serializers.SerializerMethodField()

    def get_body(self, obj):
        return self._t(obj, "body")


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
