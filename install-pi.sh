#!/bin/bash
# Cheri Installation Script for Raspberry Pi 5
# by HeySalad Inc.

set -e

echo "🍒 Cheri by HeySalad - Installation Script"
echo "=========================================="
echo ""

# Check if running on ARM64
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
    echo "❌ Error: This installer is for ARM64 systems (Raspberry Pi 5)"
    echo "   Detected architecture: $ARCH"
    exit 1
fi

# Version
VERSION="1.0.4"
APPIMAGE_NAME="Cheri-${VERSION}-arm64.AppImage"
DOWNLOAD_URL="https://github.com/Hey-Salad/Cheri-IDE/releases/download/v${VERSION}/${APPIMAGE_NAME}"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

echo "📦 Installing Cheri v${VERSION} for Raspberry Pi 5"
echo ""

# Create directories if they don't exist
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"

# Download AppImage
echo "⬇️  Downloading Cheri..."
if command -v wget &> /dev/null; then
    wget -q --show-progress "$DOWNLOAD_URL" -O "$INSTALL_DIR/$APPIMAGE_NAME"
elif command -v curl &> /dev/null; then
    curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/$APPIMAGE_NAME" --progress-bar
else
    echo "❌ Error: wget or curl is required"
    exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/$APPIMAGE_NAME"

# Create symlink
ln -sf "$INSTALL_DIR/$APPIMAGE_NAME" "$INSTALL_DIR/cheri"

# Download icon
echo "🎨 Installing icon..."
curl -sL "https://raw.githubusercontent.com/Hey-Salad/cheri/main/resources/Cheri-512.png" -o "$ICON_DIR/cheri.png" 2>/dev/null || echo "⚠️  Icon download failed (optional)"

# Create desktop entry
echo "🖥️  Creating desktop entry..."
cat > "$DESKTOP_DIR/cheri.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Cheri
Comment=AI that remembers your code
Exec=$INSTALL_DIR/cheri
Icon=cheri
Terminal=false
Categories=Development;IDE;
Keywords=ai;code;assistant;llm;
StartupWMClass=Cheri
EOF

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo ""
echo "✅ Cheri installed successfully!"
echo ""
echo "🚀 Launch Cheri:"
echo "   - Type: cheri"
echo "   - Or find 'Cheri' in your applications menu"
echo ""
echo "📍 Installation location: $INSTALL_DIR/$APPIMAGE_NAME"
echo ""
echo "🔑 First-time setup:"
echo "   1. Launch Cheri"
echo "   2. Go to AI → API Keys"
echo "   3. Add your OpenAI or Anthropic key"
echo "   4. Select a model and start coding!"
echo ""
echo "📖 Documentation: https://github.com/Hey-Salad/cheri"
echo ""
echo "Built with ❤️  by HeySalad Inc."
