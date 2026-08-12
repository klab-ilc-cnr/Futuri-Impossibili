#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

BUNDLED_NODE_DIR="/Users/andreabellandi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if [[ -x "$BUNDLED_NODE_DIR/node" ]]; then
  export PATH="$BUNDLED_NODE_DIR:$PATH"
fi

export npm_config_cache="${TMPDIR:-/private/tmp}/lexo-npm-cache"

if [[ ! -d node_modules ]]; then
  echo "Prima configurazione di LexO in corso..."
  npm install
fi

echo ""
echo "LexO sarà disponibile su http://localhost:3000/futuri-impossibili"
echo "Il browser si aprirà automaticamente."
echo "Per arrestare il progetto, torna qui e premi Ctrl+C."
echo ""

(sleep 2 && open "http://localhost:3000/futuri-impossibili") &
npm run dev
