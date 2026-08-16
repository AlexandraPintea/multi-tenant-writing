from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from content.models import Category, Page, Post
from people.models import Author

from .serializers import (
    AuthorDetailSerializer,
    AuthorSerializer,
    CategorySerializer,
    CommentCreateSerializer,
    ContactMessageCreateSerializer,
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
        # Post.visible_on carries the §4.3 list-filtering rule — only posts with
        # a translation in the active language — and the ordering. Shared with
        # next_post_for so the archive and its "next" link cannot disagree.
        return Post.visible_on(self.request.site, lang).prefetch_related(
            "translations", "authors__site"
        )

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "lang": resolve_lang(self.request),
            # The embedded author depends on who is asking — see
            # PostListSerializer.get_author.
            "site": self.request.site,
        }


class PostDetailView(APIView):
    def get(self, request, slug):
        # 1. Site/publication scope: a post not published to this site is a
        #    plain 404 (DRF's get_object_or_404 -> standard {"detail": ...}).
        post = get_object_or_404(
            Post.objects.prefetch_related("translations", "authors__site"),
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
            PostDetailSerializer(
                post, context={"lang": lang, "site": request.site}
            ).data
        )


class PostCommentsView(APIView):
    """Submit a comment. Write-only, anonymous, and moderated.

    There is no GET: approved comments are embedded in the post payload, so the
    thread is server-rendered with the article rather than arriving later.

    `authentication_classes = []` is what makes this work at all. DRF's default
    SessionAuthentication is the only thing enforcing CSRF on an APIView, and a
    cross-origin POST from the Angular app cannot carry a CSRF token today:
    CORS_ALLOW_CREDENTIALS is unset, so no cookie is sent, and x-csrftoken is
    not in CORS_ALLOW_HEADERS, so a preflight naming it would fail.

    Removing it is safe *because* the endpoint has no ambient authority. CSRF
    protects against a browser silently attaching proof of who you are; there
    is no session here, nothing reads request.user, and a forged cross-origin
    POST can do exactly what curl can do — put an unapproved row in a queue a
    human then reads. Moderation is the real gate.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "comments"

    def get_throttles(self):
        # Scoped only, and only here: a global throttle would also cover the
        # archive, and behind nginx or any office NAT every reader shares one
        # IP, so the reading pages would start answering 429.
        return [ScopedRateThrottle()]

    def post(self, request, slug):
        post = get_object_or_404(
            Post,
            slug=slug,
            sites=request.site,
            is_published=True,
        )

        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.pop("url2", ""):
            # A filled honeypot is a bot. Answer as if it worked rather than
            # explaining the trap — and store nothing.
            return Response(
                {"detail": "Thank you. Your comment is awaiting review."},
                status=status.HTTP_201_CREATED,
            )

        serializer.save(
            post=post,
            # From the request, never the payload: a submission cannot choose
            # which tenant's thread it lands in.
            site=request.site,
            language_code=resolve_lang(request),
        )
        return Response(
            {"detail": "Thank you. Your comment is awaiting review."},
            status=status.HTTP_201_CREATED,
        )


class ContactView(APIView):
    """The contact page's form. Same shape as the comment endpoint.

    Anonymous and cookie-free for the same reason and with the same safety
    argument: no session, nothing reads request.user, so there is no ambient
    authority for a forged request to borrow. What it can do is put a row in an
    inbox — which is what the form is for.

    Nothing here is ever read back out through the API; the only reader is the
    admin.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "contact"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        serializer = ContactMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.pop("url2", ""):
            return Response(
                {"detail": "Thank you. Your details have been received."},
                status=status.HTTP_201_CREATED,
            )

        serializer.save(site=request.site, language_code=resolve_lang(request))
        return Response(
            {"detail": "Thank you. Your details have been received."},
            status=status.HTTP_201_CREATED,
        )


class CategoryListView(ListAPIView):
    """Read-only category list for the current site (architecture §4.2).

    Not consumed in v1 — post payloads embed their own label — but it exists so
    category tabs can be added later without an API change.
    """

    serializer_class = CategorySerializer

    def get_queryset(self):
        lang = resolve_lang(self.request)
        # Language handling matches the post list: only categories that have a
        # translation in the active language are listed, which also makes
        # ordering by that translation's name deterministic.
        return (
            Category.objects.filter(
                site=self.request.site,
                translations__language_code=lang,
            )
            .prefetch_related("translations")
            .distinct()
            .order_by("translations__name")
        )

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "lang": resolve_lang(self.request)}


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
        # `posts` is the reverse of Post.authors, so this now returns the
        # cross-posted pieces this site's profile is attached to as well.
        author_posts = (
            author.posts.filter(sites=request.site, is_published=True)
            .prefetch_related("translations", "authors__site")
            .distinct()
            .order_by("-published_at")
        )
        data = AuthorDetailSerializer(
            author,
            context={
                "lang": lang,
                "site": request.site,
                "author_posts": author_posts,
            },
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
