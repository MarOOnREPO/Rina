#!/bin/bash
# Save Kimi history/config from ~/.kimi to workspace so it survives Codespace reboots
# Run this before closing your Codespace session, or set it as a cron job/background task

set -e

SRC="$HOME/.kimi"
DST="/workspaces/Rina/kimi-backup"

if [ ! -d "$SRC" ]; then
    echo "Source directory $SRC does not exist. Nothing to save."
    exit 0
fi

mkdir -p "$DST"

echo "Saving Kimi data to $DST ..."

# Save sessions (chat history)
if [ -d "$SRC/sessions" ]; then
    rsync -a --delete "$SRC/sessions/" "$DST/sessions/" 2>/dev/null || cp -r "$SRC/sessions" "$DST/"
fi

# Save config files
for f in config.toml device_id kimi.json; do
    if [ -f "$SRC/$f" ]; then
        cp "$SRC/$f" "$DST/$f"
    fi
done

# Optionally save logs (uncomment if needed)
# if [ -d "$SRC/logs" ]; then
#     rsync -a --delete "$SRC/logs/" "$DST/logs/" 2>/dev/null || cp -r "$SRC/logs" "$DST/"
# fi

echo "Done. Kimi history saved to $DST"
