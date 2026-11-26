#!/usr/bin/env bash
# Aplica las migraciones en un Postgres desechable y corre las pruebas de RLS.
# Uso: DATABASE_URL=postgres://postgres@localhost:5432/postgres scripts/probar-sql.sh
set -euo pipefail
cd "$(dirname "$0")/../supabase"
: "${DATABASE_URL:?Define DATABASE_URL apuntando a un Postgres de pruebas}"
DB="logiks_prueba_$$"
psql "$DATABASE_URL" -qc "create database $DB"
trap 'psql "$DATABASE_URL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL="${DATABASE_URL%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f tests/stub_supabase.sql
for f in migrations/*.sql; do psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
salida=$(psql "$URL" -f tests/rls_aislamiento.sql 2>&1)
echo "$salida" | grep -E "OK:|FUGA|exception" || true
if echo "$salida" | grep -q "FUGA\|ERROR:  .*\(faltan\|inesperado\|debería\|alterado\)"; then exit 1; fi
[ "$(echo "$salida" | grep -c "^OK:")" -eq 9 ] || { echo "$salida"; exit 1; }
