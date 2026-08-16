#!/bin/sh
# Runs before every start, including restarts. All three commands are
# idempotent, which is what makes that safe.
set -e

# Applying migrations here rather than by hand means a deploy cannot half-land:
# the container that serves the new code is the one that migrated for it. The
# risk it accepts is a second instance running the same migration later; with
# one backend container there is no second instance.
python manage.py migrate --noinput

# The DRF throttle counters live in this table. Django creates it only when
# asked, and a missing table turns every comment and contact submission into a
# 500 rather than a throttle.
python manage.py createcachetable

# Admin CSS and JS into the directory nginx serves. Django does not serve
# static files with DEBUG off, so without this the admin loads as unstyled
# HTML and looks broken rather than misconfigured.
python manage.py collectstatic --noinput

# Deliberately absent: seed_groups and seed_demo_data. seed_groups resets two
# staff accounts to a password that is written down in the repository.

exec "$@"
