#!/usr/bin/env bash
# End-to-end tests in WebKit (Safari's engine) inside the official Playwright
# container, for hosts whose libraries the WebKit build does not match (Fedora).
# The app is built and served on the host; the container only runs the browser.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./node_modules/@playwright/test/package.json').version")
ENGINE=$(command -v podman || command -v docker)

if curl -s -o /dev/null http://localhost:4173; then
	echo "Port 4173 is in use: stop that server first, it may be serving an older build." >&2
	exit 1
fi
pnpm build
# sirv itself, not through pnpm, so the trap stops the right process.
node node_modules/sirv-cli/bin.js build --single --port 4173 &
SERVER=$!
trap 'kill $SERVER' EXIT
until curl -s -o /dev/null http://localhost:4173; do sleep 0.5; done

"$ENGINE" run --rm --network host --ipc host --security-opt label=disable \
	-v "$PWD:$PWD" -w "$PWD" -e TZ=Europe/Madrid \
	"mcr.microsoft.com/playwright:v$VERSION-noble" \
	node node_modules/@playwright/test/cli.js test --project=webkit "$@"
