#!/bin/bash
set -e

echo "=== zhixia-node install ==="

# Node 20+ check
if ! command -v node &> /dev/null; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  echo "Node.js $(node -v) already installed"
fi

# Install zhixia globally
npm install -g $(pwd)

# Create identity if not exists
if [ ! -f data/identity.json ]; then
  zhixia init
fi

echo "=== Install complete ==="
echo "Run: zhixia online"
