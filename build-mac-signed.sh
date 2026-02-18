#!/bin/bash
# Cheri macOS M1 Signed Build Script
# Run this on your M1 MacBook

set -e

echo "🍒 Building Cheri for macOS M1 (Signed)"
echo "========================================"
echo ""

# Check if we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "❌ Error: This script must run on macOS"
    exit 1
fi

# Apple Developer settings
export APPLE_TEAM_ID="A24823SWLS"
export APPLE_ID="peter@heysalad.co"  # Update if needed
export CSC_NAME="SALADHR TECHNOLOGY LTD (A24823SWLS)"

# Optional: Set these if you want notarization (recommended)
# export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # Generate at appleid.apple.com
# export APPLE_TEAM_ID="A24823SWLS"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building TypeScript..."
npm run build

echo "🔐 Building signed macOS package..."
echo "   Team ID: $APPLE_TEAM_ID"
echo "   Identity: $CSC_NAME"
echo ""

# Build signed DMG
npx electron-builder --mac --arm64 --publish=never

echo ""
echo "✅ Build complete!"
echo ""
echo "📁 Output files:"
ls -lh release/*.dmg release/*.zip 2>/dev/null || true
echo ""
echo "🚀 Next steps:"
echo "   1. Test the DMG on your Mac"
echo "   2. Upload to GitHub:"
echo "      gh release upload v1.0.2 release/Cheri-1.0.2-arm64.dmg release/Cheri-1.0.2-arm64-mac.zip"
echo ""
