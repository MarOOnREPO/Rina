#!/bin/bash
set -euo pipefail

# Setup a bare git repo on the VPS for push-to-deploy
# Run this ONCE on your Lightsail server

USER="${DEPLOY_USER:-ubuntu}"
REPO_DIR="/home/$USER/rina.git"
WORK_TREE="/home/$USER/rina"
BRANCH="main"

LOG() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

LOG "🔧 Setting up git push-to-deploy..."

# Install git if missing
if ! command -v git &> /dev/null; then
  sudo apt update && sudo apt install -y git
fi

# Create bare repo
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"
git init --bare

# Create post-receive hook
HOOK="$REPO_DIR/hooks/post-receive"
cat > "$HOOK" <<EOF
#!/bin/bash
set -euo pipefail

WORK_TREE="$WORK_TREE"
BRANCH="$BRANCH"
LOG() { echo "[\$(date '+%Y-%m-%d %H:%M:%S')] \$1"; }

LOG "📥 Received push. Checking out to \$WORK_TREE..."
mkdir -p "\$WORK_TREE"
git --git-dir="$REPO_DIR" --work-tree="\$WORK_TREE" checkout -f "\$BRANCH"

LOG "🔧 Setting permissions..."
chown -R $USER:$USER "\$WORK_TREE"

LOG "🚀 Running deploy..."
cd "\$WORK_TREE"
./scripts/deploy.sh

LOG "✅ Deploy complete!"
EOF

chmod +x "$HOOK"
chown -R "$USER:$USER" "$REPO_DIR"

LOG "✅ Bare repo created at: $REPO_DIR"
LOG "✅ post-receive hook installed"
LOG ""
LOG "Next steps on your LOCAL machine:"
LOG "  git remote add vps ssh://$USER@YOUR_IP/home/$USER/rina.git"
LOG "  git push vps main"
LOG ""
LOG "The hook will auto-checkout to $WORK_TREE and run deploy.sh"
