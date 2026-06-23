from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from content.models import Page, Post
from people.models import Author

from .serializers import (
    AuthorDetailSerializer,
    AuthorSerializer,
    PageSerializer,
    PostDetailSerializer,
    PostListSerializer,
    SiteConfigSerializer,
)


class PostNotAvailableInLanguage(APIException):
    """404 raised when a post has no translation in the requested language.

    DRF's built-in ``NotFound`` only carries a ``detail`` *string*. We need the
    response body to also carry ``available_languages`` so the Angular NgRx
    effect can dispatch a typed ``loadPostDetailNotInLanguage`` action instead
    of treating it as a generic error. Passing a *dict* as ``detail`` makes
    DRF's default exception handler render that dict verbatim as the body.
    """

    status_code = 404
    default_code = "not_available_in_language"

    def __init__(self, available_languages):
        super().__init__(
            detail={
                "detail": "This post is not available in the requested language.",
                "available_languages": available_languages,
            }
        )


def resolve_lang(request):
    """Effective language for this request.

    Implements §4.3 rule 3: a ?lang= value the site does not enable is silently
    coerced to the site's default_language. (Post-level coverage is enforced
    separately, on the detail view, as a 404.)
    """
    site = request.site
    requested = request.query_params.get("lang")
    if requested and requested in site.enabled_languages:
        return requested
    return site.default_language


class SiteConfigView(APIView):
    def get(self, request):
        return Response(SiteConfigSerializer(request.site).data)


class PostListView(ListAPIView):
    serializer_class = PostListSerializer

    def get_queryset(self):
        lang = resolve_lang(self.request)
        # Only posts that actually have a translation in the active language
        # appear in that language's archive (§4.3 list-filtering rule).
        return (
            Post.objects.filter(
                sites=self.request.site,
                is_published=True,
                translations__language_code=lang,
            )
            .select_related("author")
            .prefetch_related("translations")
            .distinct()
            .order_by("-published_at")
        )

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "lang": resolve_lang(self.request)}


class PostDetailView(APIView):
    def get(self, request, slug):
        # 1. Site/publication scope: a post not published to this site is a
        #    plain 404 (DRF's get_object_or_404 -> standard {"detail": ...}).
        post = get_object_or_404(
            Post.objects.prefetch_related("translations").select_related("author"),
            slug=slug,
            sites=request.site,
            is_published=True,
        )
        # 2. Language coverage: the post exists here but not in this language.
        lang = resolve_lang(request)
        available = sorted(post.get_available_languages())
        if lang not in available:
            raise PostNotAvailableInLanguage(available_languages=available)

        return Response(
            PostDetailSerializer(post, context={"lang": lang}).data
        )


class AuthorListView(ListAPIView):
    serializer_class = AuthorSerializer

    def get_queryset(self):
        return Author.objects.filter(site=self.request.site).prefetch_related(
            "translations"
        )

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "lang": resolve_lang(self.request)}


class AuthorDetailView(APIView):
    def get(self, request, slug):
        author = get_object_or_404(
            Author.objects.prefetch_related("translations"),
            slug=slug,
            site=request.site,
        )
        lang = resolve_lang(request)
        author_posts = (
            author.posts.filter(sites=request.site, is_published=True)
            .select_related("author")
            .prefetch_related("translations")
            .distinct()
            .order_by("-published_at")
        )
        data = AuthorDetailSerializer(
            author, context={"lang": lang, "author_posts": author_posts}
        ).data
        return Response(data)


class PageDetailView(APIView):
    def get(self, request, slug):
        page = get_object_or_404(
            Page.objects.prefetch_related("translations"),
            slug=slug,
            site=request.site,
        )
        lang = resolve_lang(request)
        return Response(PageSerializer(page, context={"lang": lang}).data)