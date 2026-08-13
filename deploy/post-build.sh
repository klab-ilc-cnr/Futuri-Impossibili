#!/bin/sh
# Post-build per il deploy: sposta gli asset hashed alla root di dist/client.
# vinext serve /_next/static/* solo alla root (non sotto il basePath), quindi
# i file vanno spostati da dist/client/<basePath>/_next a dist/client/_next.
# Il proxy (reverse proxy) riscrive /futuri-impossibili/_next/static/* -> /_next/static/*.
set -e

SRC="dist/client/futuri-impossibili/_next"
DST="dist/client/_next"

if [ -d "$SRC" ]; then
  rm -rf "$DST"
  mv "$SRC" "$DST"
  echo "Asset spostati: $SRC -> $DST"
else
  ls dist/client/ 2>/dev/null || true
  echo "ATTENZIONE: $SRC non trovato; verifica il path del basePath nel dist."
fi