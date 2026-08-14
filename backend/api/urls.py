from django.urls import path

from .views import (
    AuthorDetailView,
    AuthorListView,
    PageDetailView,
    PostDetailView,
    PostListView,
    SiteConfigView,
)

urlpatterns = [
    path("site-config/", SiteConfigView.as_view(), name="site-config"),
    path("posts/", PostListView.as_view(), name="post-list"),
    path("posts/<slug:slug>/", PostDetailView.as_view(), name="post-detail"),
    path("authors/", AuthorListView.as_view(), name="author-list"),
    path("authors/<slug:slug>/", AuthorDetailView.as_view(), name="author-detail"),
    path("pages/<slug:slug>/", PageDetailView.as_view(), name="page-detail"),
]
