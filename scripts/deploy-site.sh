#!/bin/sh
# Publishes the landing page (site/dist) to the homelab over SSH (docs/07, "Página de presentación").
# The host serves it with Caddy behind a Cloudflare Tunnel at qadrant.iisra.dev.
set -eu

TARGET="${QADRANT_SITE_SSH:-deploy@HOMELAB_HOST}"
KEY="${QADRANT_SITE_KEY:-$HOME/.ssh/qadrant_site}"

[ -f site/dist/index.html ] || { echo "site/dist is empty: run pnpm site:build first" >&2; exit 1; }

# _headers is for Cloudflare Pages; Caddy sets the same headers itself.
rsync -rltz --delete --delete-excluded --chmod=D755,F644 --exclude _headers \
	-e "ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o BatchMode=yes" \
	site/dist/ "$TARGET:/srv/qadrant-site/"

echo "Landing page published to $TARGET:/srv/qadrant-site"
