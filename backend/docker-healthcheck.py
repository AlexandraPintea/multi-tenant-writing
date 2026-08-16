"""Container health probe: is the API answering with real data?

Run by Docker's HEALTHCHECK. Two things here are not obvious:

ALLOWED_HOSTS. Django rejects a request whose Host it does not recognise, and
"localhost" is not on the production list, so a naive probe would get a 400
forever and the container would be marked unhealthy while serving readers
perfectly. The first configured host is sent instead.

X-Forwarded-Proto. Production has SECURE_SSL_REDIRECT on, so a plain HTTP
request is answered with a 301 to https — which the probe would read as "not
200". The header says what is true of the hop nginx would have made.
"""

import os
import sys
import urllib.error
import urllib.request

PORT = os.environ.get("PORT", "8000")
HOSTS = [host.strip() for host in os.environ.get("ALLOWED_HOSTS", "").split(",")]
HOST = next((host for host in HOSTS if host), "localhost")

request = urllib.request.Request(
    f"http://127.0.0.1:{PORT}/api/site-config/",
    headers={
        "Host": HOST,
        "X-Site-Domain": os.environ.get("DEFAULT_SITE_DOMAIN", HOST),
        "X-Forwarded-Proto": "https",
    },
)

try:
    with urllib.request.urlopen(request, timeout=4) as response:
        sys.exit(0 if response.status == 200 else 1)
except (urllib.error.URLError, OSError) as error:
    print(f"health check failed: {error}", file=sys.stderr)
    sys.exit(1)
