#!/bin/bash
# Restore Kimi history/config from workspace backup into ~/.kimi
# Run this when opening a fresh Codespace session

set -e

SRC="/workspaces/Rina/kimi-backup"
DST="$HOME/.kimi"

if [ ! -d "$SRC" ]; then
    echo "Backup directory $SRC does not exist. Nothing to restore."
    exit 0
fi

mkdir -p "$DST"

echo "Restoring Kimi data from $SRC ..."

# Restore sessions (chat history)
if [ -d "$SRC/sessions" ]; then
    rsync -a --delete "$SRC/sessions/" "$DST/sessions/" 2>/dev/null || cp -r "$SRC/sessions" "$DST/"
fi

# Restore config files
for f in config.toml device_id kimi.json; do
    if [ -f "$SRC/$f" ]; then
        cp "$SRC/$f" "$DST/$f"
    fi
done

# Optionally restore logs (uncomment if needed)
# if [ -d "$SRC/logs" ]; then
#     rsync -a --delete "$SRC/logs/" "$DST/logs/" 2>/dev/null || cp -r "$SRC/logs" "$DST/"
# fi

echo "Done. Kimi history restored to $DST"
