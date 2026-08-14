from django.core.management.base import BaseCommand
from django.utils import timezone

from content.models import Post
from people.models import Author
from sites_core.models import Site


class Command(BaseCommand):
    help = "Insert minimal demo data for local development (idempotent)."

    def handle(self, *args, **options):
        self._seed_sites()
        self._seed_authors()
        self._seed_posts()
        self.stdout.write(self.style.SUCCESS("Demo data seeded."))

    # ------------------------------------------------------------------ sites

    def _seed_sites(self):
        self.ap, _ = Site.objects.get_or_create(
            domain="alexandrapintea.eu",
            defaults={
                "name": "Alexandra Pintea",
                "default_language": "en",
                "enabled_languages": ["en", "ro"],
                "theme_config": {
                    "--accent": "#5b3a29",
                    "--font-display": "'Source Serif Pro', serif",
                    "layout": "editorial",
                },
            },
        )
        self.roam, _ = Site.objects.get_or_create(
            domain="roamliterary.com",
            defaults={
                "name": "Roam Literary",
                "default_language": "en",
                "enabled_languages": ["en"],
                "theme_config": {
                    "--accent": "#8e44ad",
                    "--font-display": "'Merriweather', serif",
                    "layout": "collective",
                },
            },
        )
        self.stdout.write("  sites ok")

    # ---------------------------------------------------------------- authors

    def _seed_authors(self):
        # Alexandra on alexandrapintea.eu — bilingual bio
        self.ap_author, _ = Author.objects.get_or_create(
            site=self.ap,
            slug="alexandra-pintea",
            defaults={
                "name": "Alexandra Pintea",
                "location": "Romania",
                "social_links": {"twitter": "https://twitter.com/alexandrapintea"},
            },
        )
        self.ap_author.set_current_language("en")
        self.ap_author.bio = "Writer and literary explorer based in Romania."
        self.ap_author.save()
        self.ap_author.set_current_language("ro")
        self.ap_author.bio = "Scriitoare și exploratoare literară din România."
        self.ap_author.save()

        # Alexandra on roamliterary.com — separate record, EN-only bio
        self.roam_author, _ = Author.objects.get_or_create(
            site=self.roam,
            slug="alexandra-pintea",
            defaults={
                "name": "Alexandra Pintea",
                "location": "Romania",
                "social_links": {"twitter": "https://twitter.com/roamliterary"},
            },
        )
        self.roam_author.set_current_language("en")
        self.roam_author.bio = "The literary voice behind Roam Literary."
        self.roam_author.save()
        self.stdout.write("  authors ok")

    # ------------------------------------------------------------------ posts

    def _seed_posts(self):
        # Bilingual post published on both sites
        bilingual, _ = Post.objects.get_or_create(
            slug="the-power-of-words",
            defaults={
                "author": self.ap_author,
                "published_at": timezone.now(),
                "is_published": True,
            },
        )
        bilingual.set_current_language("en")
        bilingual.title = "The Power of Words"
        bilingual.body = (
            "Words have the power to shape worlds, build bridges, and break walls."
        )
        bilingual.excerpt = (
            "An exploration of language and its quiet, relentless force."
        )
        bilingual.save()
        bilingual.set_current_language("ro")
        bilingual.title = "Puterea Cuvintelor"
        bilingual.body = (
            "Cuvintele au puterea de a modela lumi, "
            "de a construi punți și de a dărâma ziduri."
        )
        bilingual.excerpt = (
            "O explorare a limbajului și a forței sale liniștite, neobosit."
        )
        bilingual.save()
        bilingual.sites.set([self.ap, self.roam])

        # English-only post published only on alexandrapintea.eu
        en_only, _ = Post.objects.get_or_create(
            slug="writing-in-the-margins",
            defaults={
                "author": self.ap_author,
                "published_at": timezone.now(),
                "is_published": True,
            },
        )
        en_only.set_current_language("en")
        en_only.title = "Writing in the Margins"
        en_only.body = (
            "There is something sacred about the notes "
            "we leave in the margins of books."
        )
        en_only.excerpt = (
            "A meditation on annotation, marginalia, and the act of reading."
        )
        en_only.save()
        en_only.sites.set([self.ap])

        self.stdout.write("  posts ok")
