#!/bin/sh
# Builds the extension zip and publishes it to the Chrome Web Store.
# Needs EXTENSION_ID, PUBLISHER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN (env or a git-ignored .env).
# Bump "version" in manifest.json first; the store rejects a version that isn't higher.
set -e
cd "$(dirname "$0")"
[ -f .env ] && { set -a; . ./.env; set +a; }
node --test test/
rm -f duplicate-tab-finder.zip
zip -q duplicate-tab-finder.zip manifest.json popup.html popup.css popup.js dupes.js icons/icon16.png icons/icon48.png icons/icon128.png
npx -y chrome-webstore-upload-cli@4 --source duplicate-tab-finder.zip
