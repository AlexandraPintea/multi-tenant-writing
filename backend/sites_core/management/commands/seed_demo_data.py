from django.core.management.base import BaseCommand
from django.utils import timezone

from content.models import Category, Page, Post
from people.models import Author
from sites_core.models import Site


class Command(BaseCommand):
    help = "Insert minimal demo data for local development (idempotent)."

    def handle(self, *args, **options):
        self._seed_sites()
        self._seed_authors()
        self._seed_categories()
        self._seed_posts()
        self._seed_pages()
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
                    "layout": "grid",
                },
            },
        )
        # get_or_create ignores defaults for a row that already exists, so an
        # existing dev database keeps the old "collective" key and the frontend
        # layout switch falls through. Correct that one value in place rather
        # than overwriting theme_config, which may carry hand-edited colours.
        if self.roam.theme_config.get("layout") == "collective":
            self.roam.theme_config["layout"] = "grid"
            self.roam.save(update_fields=["theme_config"])

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

    # ------------------------------------------------------------- categories

    def _seed_categories(self):
        # (slug, EN, RO) — Roam is an English-only site, so its categories
        # carry the EN label only and parler handles the missing RO row.
        specs = [
            ("essay", "Essay", "Eseu"),
            ("fiction", "Fiction", "Ficțiune"),
            ("notes", "Notes", "Însemnări"),
        ]

        self.ap_categories = {}
        self.roam_categories = {}
        for slug, name_en, name_ro in specs:
            ap_category, _ = Category.objects.get_or_create(site=self.ap, slug=slug)
            ap_category.set_current_language("en")
            ap_category.name = name_en
            ap_category.save()
            ap_category.set_current_language("ro")
            ap_category.name = name_ro
            ap_category.save()
            self.ap_categories[slug] = ap_category

            roam_category, _ = Category.objects.get_or_create(site=self.roam, slug=slug)
            roam_category.set_current_language("en")
            roam_category.name = name_en
            roam_category.save()
            self.roam_categories[slug] = roam_category

        self.stdout.write("  categories ok")

    # ------------------------------------------------------------------ posts

    def _seed_posts(self):
        # Bilingual post published on both sites
        bilingual, _ = Post.objects.get_or_create(
            slug="the-power-of-words",
            defaults={"published_at": timezone.now()},
        )
        # Publication is per language, so it is set per language — on the
        # translation, next to the title and body it governs.
        bilingual.set_current_language("en")
        bilingual.is_published = True
        bilingual.title = "The Power of Words"
        bilingual.body = (
            "Words have the power to shape worlds, build bridges, and break walls."
        )
        bilingual.excerpt = (
            "An exploration of language and its quiet, relentless force."
        )
        bilingual.save()
        bilingual.set_current_language("ro")
        bilingual.is_published = True
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
        # One Author per target site — this is the cross-posting case the M2M
        # exists for: the piece appears under a different profile on each site.
        bilingual.authors.set([self.ap_author, self.roam_author])
        # Only fill an empty category: re-running must not stomp an assignment
        # made by hand in the admin.
        if bilingual.category_id is None:
            bilingual.category = self.ap_categories["essay"]
            bilingual.save(update_fields=["category"])

        # English-only post published only on alexandrapintea.eu
        en_only, _ = Post.objects.get_or_create(
            slug="writing-in-the-margins",
            defaults={"published_at": timezone.now()},
        )
        en_only.set_current_language("en")
        en_only.is_published = True
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
        en_only.authors.set([self.ap_author])
        if en_only.category_id is None:
            en_only.category = self.ap_categories["notes"]
            en_only.save(update_fields=["category"])

        self.stdout.write("  posts ok")

    # ------------------------------------------------------------------ pages

    def _seed_pages(self):
        ap_about, _ = Page.objects.get_or_create(site=self.ap, slug="about")
        ap_about.set_current_language("en")
        ap_about.title = "About"
        ap_about.content = (
            "Romanian writer based in Zalău. Essays and fiction, "
            "in English and Romanian."
        )
        ap_about.save()
        ap_about.set_current_language("ro")
        ap_about.title = "Despre"
        ap_about.content = (
            "Scriitoare din Zalău. Eseuri și ficțiune, în engleză și română."
        )
        ap_about.save()

        roam_about, _ = Page.objects.get_or_create(site=self.roam, slug="about")
        roam_about.set_current_language("en")
        roam_about.title = "About"
        roam_about.content = (
            "Roam Literary is a collective of writers in Budapest, Austin, "
            "The Hague and Cluj."
        )
        roam_about.save()

        self.stdout.write("  pages ok")
