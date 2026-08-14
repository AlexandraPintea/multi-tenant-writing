from django.contrib.auth.models import Group, Permission, User
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from people.models import UserProfile
from sites_core.models import Site

# Models both groups may fully manage on their own site. Parler's *Translation
# models declare default_permissions = (), so they have no Permission rows to
# grant — translations are edited through the parent object's form.
MANAGED_MODELS = [
    ("content", "post"),
    ("content", "page"),
    ("people", "author"),
]

GROUP_SITES = {
    "alexandra_admin": "alexandrapintea.eu",
    "roam_editors": "roamliterary.com",
}

DEMO_ACCOUNTS = {
    "alex_admin@example.com": "alexandra_admin",
    "roam_editor@example.com": "roam_editors",
}

DEFAULT_PASSWORD = "demo-password-1234"


class Command(BaseCommand):
    help = (
        "Create the per-site admin groups and two non-superuser demo accounts. "
        "Idempotent; local development only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=DEFAULT_PASSWORD,
            help="Password set on the demo accounts on every run.",
        )

    def handle(self, *args, **options):
        self.sites = self._load_sites()
        self.groups = self._seed_groups()
        self._seed_accounts(options["password"])
        self.stdout.write(self.style.SUCCESS("Groups and demo accounts seeded."))

    # ------------------------------------------------------------------ sites

    def _load_sites(self):
        sites = {}
        for domain in GROUP_SITES.values():
            site = Site.objects.filter(domain=domain).first()
            if site is None:
                raise CommandError(
                    f"Site '{domain}' does not exist. Run seed_demo_data first."
                )
            sites[domain] = site
        return sites

    # ----------------------------------------------------------------- groups

    def _managed_permissions(self):
        query = Q()
        for app_label, model in MANAGED_MODELS:
            query |= Q(content_type__app_label=app_label, content_type__model=model)
        return Permission.objects.filter(query)

    def _seed_groups(self):
        permissions = list(self._managed_permissions())
        expected = len(MANAGED_MODELS) * 4  # add/change/delete/view per model
        if len(permissions) != expected:
            raise CommandError(
                f"Expected {expected} permissions for {MANAGED_MODELS}, "
                f"found {len(permissions)}. Are migrations applied?"
            )

        groups = {}
        for name in GROUP_SITES:
            group, _ = Group.objects.get_or_create(name=name)
            # set() rather than add() so re-running also *removes* permissions
            # that were granted by hand and are no longer in MANAGED_MODELS.
            group.permissions.set(permissions)
            groups[name] = group
        self.stdout.write(f"  groups ok ({len(permissions)} permissions each)")
        return groups

    # --------------------------------------------------------------- accounts

    def _seed_accounts(self, password):
        for email, group_name in DEMO_ACCOUNTS.items():
            # Username is the email so the login form accepts the address
            # itself — Django authenticates on username, not email.
            user, _ = User.objects.get_or_create(
                username=email,
                defaults={"email": email},
            )
            user.email = email
            user.is_staff = True
            user.is_superuser = False
            user.set_password(password)
            user.save()
            user.groups.set([self.groups[group_name]])

            site = self.sites[GROUP_SITES[group_name]]
            UserProfile.objects.update_or_create(user=user, defaults={"site": site})
            self.stdout.write(f"  {email} -> {group_name} @ {site.domain}")
