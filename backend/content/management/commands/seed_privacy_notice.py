"""Seed the privacy notice as an editable Page, in English and Romanian.

A first draft, not legal advice. Every factual claim below was written from what
the code actually does — the fields the forms collect, where they are stored,
who can see them — so the description of the *system* is accurate. The claims
about the *controller* are not something code can know: the contact address and
the retention periods are marked and have to be confirmed before this is
published.

A management command rather than a data migration: the notice is content, it
will be edited in the admin, and a legal text frozen into migration history is
awkward to correct. Idempotent — existing pages are left alone unless --force.
"""

from django.core.management.base import BaseCommand

from content.models import Page
from sites_core.models import Site

# Marked so it is impossible to publish by accident without noticing.
EMAIL_PLACEHOLDER = "[ADD YOUR CONTACT EMAIL]"

EN_TITLE = "Privacy"

EN_BODY = f"""
<p><em>Last updated: [ADD DATE]. This notice explains what happens to personal
information on this site.</em></p>

<h2>Who is responsible</h2>
<p>Alexandra Pintea is responsible for the personal data described here (the
"data controller" under the GDPR). You can reach me at
{EMAIL_PLACEHOLDER}, or through the <a href="/contact">contact page</a>.</p>

<h2>What this site collects</h2>

<h3>If you leave a comment</h3>
<p>The name you type and the text of your comment are stored, along with the
date, the piece you commented on and which language you were reading in. Your
comment is not published until I have read it. <strong>The name you give is
published alongside your comment</strong>, so please use whatever name you are
comfortable being seen. No email address is asked for or stored.</p>

<h3>If you use the contact form</h3>
<p>Your first name, last name and email address are stored so I can reply. If
you tick the box asking for updates, the fact that you ticked it, the exact
wording you agreed to and the date are stored as well — that record exists so I
can show you what you agreed to. These details are never published on the site,
and I do not sell, rent or share them.</p>

<h3>When you simply read</h3>
<p>The site remembers your language choice in your browser's local storage.
That never leaves your device and is not used to identify you. There are no
analytics, no advertising and no third-party tracking scripts on this site,
which is why you are not being asked to accept cookies.</p>
<p>Like any website, the server keeps technical logs of requests, which can
include your IP address, for security and troubleshooting. [CONFIRM: how long
your host keeps these logs.]</p>

<h2>Why I am allowed to hold it</h2>
<ul>
<li><strong>Comments and contact messages</strong> — because you chose to send
them, and holding them is what lets the conversation happen at all.</li>
<li><strong>Email updates</strong> — only with your consent, given by ticking a
box that is never pre-ticked. You can withdraw it at any time, and withdrawing
it does not affect anything sent before.</li>
<li><strong>Server logs</strong> — a legitimate interest in keeping the site
running and secure.</li>
</ul>

<h2>How long it is kept</h2>
<ul>
<li>Published comments stay as long as the piece they belong to, unless you ask
me to remove yours.</li>
<li>Comments I do not approve are deleted.</li>
<li>Contact messages are kept for [CONFIRM: e.g. two years] after we last
spoke, then deleted.</li>
<li>If you subscribed to updates, your email is kept until you unsubscribe.</li>
</ul>

<h2>Who else sees it</h2>
<p>The site runs on a server rented from Hetzner, in the European Union, which
means Hetzner technically stores the data on my behalf. Nobody else has access.
[CONFIRM before publishing: your hosting provider and its location, and any
email service you later use to send updates.] Nothing is transferred outside
the European Economic Area.</p>

<h2>Your rights</h2>
<p>You can ask me to show you what I hold about you, correct it, delete it,
limit what I do with it, or send it to you in a portable form. You can object to
my holding it, and if you subscribed to updates you can withdraw that consent at
any time. Write to {EMAIL_PLACEHOLDER} and I will respond within one month.</p>
<p>There is nothing automated here: no profiling, and no decisions made about
you by a machine.</p>
<p>If you think I have handled your data badly, you can complain to the
Romanian supervisory authority, ANSPDCP (<a
href="https://www.dataprotection.ro" target="_blank">dataprotection.ro</a>).</p>

<h2>Changes</h2>
<p>If what I do with personal data changes, this page changes with it, and the
date at the top will tell you when.</p>
"""

RO_TITLE = "Confidențialitate"

RO_BODY = f"""
<p><em>Ultima actualizare: [ADAUGĂ DATA]. Această notă explică ce se întâmplă cu
datele personale pe acest site.</em></p>

<h2>Cine răspunde</h2>
<p>Alexandra Pintea răspunde de datele personale descrise aici („operatorul de
date” conform GDPR). Mă poți contacta la {EMAIL_PLACEHOLDER} sau prin
<a href="/contact">pagina de contact</a>.</p>

<h2>Ce colectează acest site</h2>

<h3>Dacă lași un comentariu</h3>
<p>Se păstrează numele pe care îl scrii și textul comentariului, împreună cu
data, textul la care ai comentat și limba în care citeai. Comentariul nu apare
până nu îl citesc. <strong>Numele pe care îl dai este publicat alături de
comentariu</strong>, așa că folosește un nume cu care te simți confortabil să
apari. Nu se cere și nu se păstrează nicio adresă de email.</p>

<h3>Dacă folosești formularul de contact</h3>
<p>Se păstrează prenumele, numele și adresa ta de email, ca să îți pot răspunde.
Dacă bifezi căsuța pentru vești, se păstrează și faptul că ai bifat-o, textul
exact cu care ai fost de acord și data — acea înregistrare există ca să îți pot
arăta cu ce anume ai fost de acord. Aceste date nu apar niciodată pe site și nu
le vând, închiriez sau împărtășesc.</p>

<h3>Când doar citești</h3>
<p>Site-ul ține minte limba aleasă în memoria locală a browserului tău. Nu
părăsește niciodată dispozitivul tău și nu este folosită ca să te identifice. Nu
există analytics, reclame sau scripturi de urmărire de la terți pe acest site —
de aceea nu ți se cere să accepți cookie-uri.</p>
<p>Ca orice site, serverul păstrează jurnale tehnice ale cererilor, care pot
include adresa ta IP, pentru securitate și depanare. [DE CONFIRMAT: cât timp le
păstrează furnizorul de găzduire.]</p>

<h2>De ce am voie să le păstrez</h2>
<ul>
<li><strong>Comentarii și mesaje de contact</strong> — pentru că ai ales să le
trimiți, iar păstrarea lor este ceea ce face posibilă conversația.</li>
<li><strong>Vești pe email</strong> — doar cu consimțământul tău, dat printr-o
căsuță care nu este niciodată bifată dinainte. Îl poți retrage oricând, iar
retragerea nu afectează ce s-a trimis înainte.</li>
<li><strong>Jurnalele serverului</strong> — un interes legitim de a menține
site-ul funcțional și în siguranță.</li>
</ul>

<h2>Cât timp sunt păstrate</h2>
<ul>
<li>Comentariile publicate rămân cât timp rămâne textul la care aparțin, dacă nu
îmi ceri să îl șterg pe al tău.</li>
<li>Comentariile pe care nu le aprob sunt șterse.</li>
<li>Mesajele de contact se păstrează [DE CONFIRMAT: de ex. doi ani] după ultima
discuție, apoi sunt șterse.</li>
<li>Dacă te-ai abonat la vești, adresa ta rămâne până când te dezabonezi.</li>
</ul>

<h2>Cine le mai vede</h2>
<p>Site-ul rulează pe un server închiriat de la Hetzner, în Uniunea Europeană,
ceea ce înseamnă că Hetzner stochează tehnic datele în numele meu. Nimeni
altcineva nu are acces. [DE CONFIRMAT înainte de publicare: furnizorul de
găzduire și locația lui, plus orice serviciu de email folosit ulterior pentru
trimiterea veștilor.] Nimic nu este transferat în afara Spațiului Economic
European.</p>

<h2>Drepturile tale</h2>
<p>Îmi poți cere să îți arăt ce dețin despre tine, să corectez, să șterg, să
limitez ce fac cu datele sau să ți le trimit într-o formă portabilă. Te poți
opune păstrării lor, iar dacă te-ai abonat la vești îți poți retrage
consimțământul oricând. Scrie-mi la {EMAIL_PLACEHOLDER} și îți răspund în cel
mult o lună.</p>
<p>Nimic nu este automatizat aici: fără profilare și fără decizii luate despre
tine de o mașină.</p>
<p>Dacă crezi că ți-am gestionat greșit datele, poți depune o plângere la
ANSPDCP (<a href="https://www.dataprotection.ro" target="_blank">
dataprotection.ro</a>).</p>

<h2>Modificări</h2>
<p>Dacă se schimbă ce fac cu datele personale, se schimbă și această pagină, iar
data de sus îți spune când.</p>
"""


class Command(BaseCommand):
    help = (
        "Create the privacy notice Page for every Site, in EN and RO. "
        "Idempotent: existing pages are left alone unless --force."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite an existing privacy page, discarding admin edits.",
        )

    def handle(self, *args, **options):
        for site in Site.objects.all():
            page, created = Page.objects.get_or_create(site=site, slug="privacy")

            if not created and not options["force"]:
                self.stdout.write(f"  {site.domain}: already exists, left alone")
                continue

            for language, title, body in (
                ("en", EN_TITLE, EN_BODY),
                ("ro", RO_TITLE, RO_BODY),
            ):
                page.set_current_language(language)
                page.title = title
                page.content = body.strip()
            page.save()

            verb = "created" if created else "overwritten"
            self.stdout.write(f"  {site.domain}: {verb}")

        self.stdout.write(
            self.style.WARNING(
                f"Draft only. Replace {EMAIL_PLACEHOLDER} and every [CONFIRM]/"
                "[ADD] marker before publishing, and have it reviewed."
            )
        )
