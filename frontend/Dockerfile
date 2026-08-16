# The build toolchain — the Angular compiler, every devDependency, the whole
# node_modules tree — stays in the builder. None of it is needed to answer a
# request, and shipping it would multiply both the image size and the surface
# anyone could attack.
FROM node:22-alpine AS builder

WORKDIR /app

# Lock file first, so npm ci is only re-run when dependencies actually change.
# ci rather than install: it installs exactly what package-lock.json records and
# fails if the two disagree, instead of quietly resolving something newer than
# what was tested.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Production configuration by default, which is the one that sets API_BASE_URL
# to a relative /api and turns on optimisation.
RUN npm run build


FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# dist alone. The server bundle carries its dependencies inside it — express
# included — so there is no node_modules to copy and nothing to install here.
COPY --from=builder --chown=node:node /app/dist ./dist

# node:22-alpine ships a `node` user; no need to create one.
USER node

EXPOSE 4000

# Cheap by design: /healthz answers without rendering, so the probe does not
# call the API and does not report this container unhealthy when the backend
# is the thing that is down.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/healthz || exit 1

# 512MB heap on a 4GB box shared with Postgres, Django and nginx. Node sizes
# its heap from total memory and would happily grow past a gigabyte before
# collecting, at which point the kernel starts choosing which of the three
# services to kill. Rendering a page needs nowhere near this much.
CMD ["node", "--max-old-space-size=512", "dist/writing-frontend/server/server.mjs"]
