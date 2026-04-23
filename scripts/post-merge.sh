#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Backfill: apagar auto-generación en todos los negocios existentes.
# El default cambió de true → false. Este UPDATE aplica el cambio a los ya creados.
# Es idempotente — si todos ya tienen false, actualiza 0 filas sin error.
echo "[post-merge] Apagando auto_generation_enabled para negocios existentes..."
psql "$DATABASE_URL" -c "UPDATE businesses SET auto_generation_enabled = false WHERE auto_generation_enabled = true;"
echo "[post-merge] auto_generation_enabled backfill completado."
