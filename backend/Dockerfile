# Two stages so the runtime image carries the installed packages but not pip's
# build machinery, the wheel cache, or the lock file's toolchain.
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Only the lock file, and only then the install: this layer is rebuilt when a
# dependency changes, not every time a view is edited. Copying the source first
# would throw the whole install away on every commit.
#
# --require-hashes is what makes requirements.txt worth having. Every package
# must match a recorded hash, so a compromised or re-uploaded release on PyPI
# fails the build instead of shipping. It also forces the file to be complete:
# pip refuses to install a hashed file with any unpinned transitive dependency.
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes --prefix=/install -r requirements.txt


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

# manage.py calls setdefault, so the line above wins and no compose file has to
# remember to pass it. Getting it wrong means running local.py in production —
# DEBUG on, every Host accepted — which is not the kind of mistake that
# announces itself.

WORKDIR /app

COPY --from=builder /install /usr/local

# Non-root, with a fixed uid so the host directories bind-mounted over
# /app/media and /app/staticfiles can be chowned to a number that is stable
# across rebuilds. Without that, uploads fail with a permission error the first
# time someone adds a cover image.
RUN useradd --create-home --uid 1000 app

COPY --chown=app:app . .

# chmod because the build context comes from a Windows working copy, where the
# executable bit does not survive the trip.
RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/media /app/staticfiles \
    && chown app:app /app/media /app/staticfiles

USER app

EXPOSE 8000

# 200 from the API means the process is up *and* the database answered — a TCP
# check on the port would pass while every request 500s on a dead connection.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["python", "/app/docker-healthcheck.py"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

# exec'd by the entrypoint, so gunicorn is PID 1 and receives Docker's SIGTERM
# directly. Wrapped in a shell it would not: the shell ignores the signal,
# Docker waits its ten seconds and kills the container, and requests in flight
# are cut off instead of finishing.
#
# Three workers on two vCPUs. The usual 2n+1 assumes the box is the app's
# alone; here Node and Postgres want the same 4GB.
#
# --forwarded-allow-ips=* looks alarming and is not: the port is published on
# loopback only, so the sole clients are nginx on the host and the SSR
# container. Without it gunicorn ignores X-Forwarded-* from those, because the
# peer address is the Docker bridge rather than 127.0.0.1.
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "60", \
     "--forwarded-allow-ips", "*", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
