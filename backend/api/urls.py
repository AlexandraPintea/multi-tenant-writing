from django.urls import path

from .views import (
    AuthorDetailView,
    AuthorListView,
    CategoryListView,
    PageDetailView,
    PostCommentsView,
    PostDetailView,
    PostListView,
    SiteConfigView,
)

urlpatterns = [
    path("site-config/", SiteConfigView.as_view(), name="site-config"),
    path("posts/", PostListView.as_view(), name="post-list"),
    path("posts/<slug:slug>/", PostDetailView.as_view(), name="post-detail"),
    # POST only — approved comments are embedded in the post payload above.
    path(
        "posts/<slug:slug>/comments/",
        PostCommentsView.as_view(),
        name="post-comments",
    ),
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("authors/", AuthorListView.as_view(), name="author-list"),
    path("authors/<slug:slug>/", AuthorDetailView.as_view(), name="author-detail"),
    path("pages/<slug:slug>/", PageDetailView.as_view(), name="page-detail"),
]
