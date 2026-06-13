#!/usr/bin/env bash
# Backs up app.db (hot-safe via SQLite backup API) and media/ to backups/
# Keeps the most recent KEEP_COUNT backups; older ones are pruned.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_SRC="$SCRIPT_DIR/backend/app.db"
MEDIA_SRC="$SCRIPT_DIR/backend/media"
BACKUP_DIR="$SCRIPT_DIR/backups"
KEEP_COUNT=30

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
DB_DEST="$BACKUP_DIR/app_${STAMP}.db"
MEDIA_DEST="$BACKUP_DIR/media_${STAMP}"

# SQLite online backup — safe even while the app is running
python3 - "$DB_SRC" "$DB_DEST" <<'EOF'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
with sqlite3.connect(src) as s, sqlite3.connect(dst) as d:
    s.backup(d)
EOF

# Media snapshot
if [ -d "$MEDIA_SRC" ]; then
    cp -r "$MEDIA_SRC" "$MEDIA_DEST"
fi

echo "[backup] saved $DB_DEST"

# Prune old db backups beyond KEEP_COUNT
mapfile -t OLD_DBS < <(ls -1t "$BACKUP_DIR"/app_*.db 2>/dev/null | tail -n +$((KEEP_COUNT + 1)))
for f in "${OLD_DBS[@]}"; do
    rm -f "$f"
    # Remove matching media snapshot if it exists
    snap="${f/app_/media_}"
    snap="${snap%.db}"
    rm -rf "$snap"
    echo "[backup] pruned $f"
done
