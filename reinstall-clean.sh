#!/bin/bash
# Cheri - Nuclear Clean Reinstall Script
# Removes ALL traces and installs fresh v1.0.4

set -e

VERSION="1.0.7"
APPIMAGE_NAME="Cheri-${VERSION}-arm64.AppImage"
DOWNLOAD_URL="https://github.com/Hey-Salad/Cheri-IDE/releases/download/v${VERSION}/${APPIMAGE_NAME}"

# Detect actual user (works with sudo)
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
    ACTUAL_HOME=$(eval echo ~$SUDO_USER)
else
    ACTUAL_USER="$USER"
    ACTUAL_HOME="$HOME"
fi

echo "🍒 Cheri - Nuclear Clean Reinstall"
echo "===================================="
echo "   User: $ACTUAL_USER"
echo "   Home: $ACTUAL_HOME"
echo ""

# 1. Kill any running Cheri processes
echo "1️⃣  Killing any running Cheri processes..."
pkill -f "Cheri.*AppImage" 2>/dev/null || true
pkill -f "cheri" 2>/dev/null || true
sleep 1
echo "   ✅ Processes killed"
echo ""

# 2. Remove old AppImages
echo "2️⃣  Removing old AppImages..."
rm -f $ACTUAL_HOME/.local/bin/Cheri-*.AppImage 2>/dev/null || true
rm -f $ACTUAL_HOME/.local/bin/cheri 2>/dev/null || true
rm -f $ACTUAL_HOME/Cheri-*.AppImage 2>/dev/null || true
rm -f $ACTUAL_HOME/Downloads/Cheri-*.AppImage 2>/dev/null || true
echo "   ✅ Old AppImages removed"
echo ""

# 3. Clear ALL caches
echo "3️⃣  Clearing ALL caches..."
rm -rf $ACTUAL_HOME/.cache/cheri 2>/dev/null || true
rm -rf $ACTUAL_HOME/.cache/Cheri 2>/dev/null || true
rm -rf $ACTUAL_HOME/.cache/brilliantcode 2>/dev/null || true
rm -rf $ACTUAL_HOME/.config/cheri/Cache 2>/dev/null || true
rm -rf $ACTUAL_HOME/.config/cheri/GPUCache 2>/dev/null || true
rm -rf $ACTUAL_HOME/.config/Cheri/Cache 2>/dev/null || true
rm -rf $ACTUAL_HOME/.config/Cheri/GPUCache 2>/dev/null || true
rm -rf /tmp/.org.chromium.Chromium.* 2>/dev/null || true
echo "   ✅ Caches cleared"
echo ""

# 4. Remove desktop entries
echo "4️⃣  Removing old desktop entries..."
rm -f $ACTUAL_HOME/.local/share/applications/cheri.desktop 2>/dev/null || true
rm -f $ACTUAL_HOME/.local/share/applications/Cheri.desktop 2>/dev/null || true
rm -f $ACTUAL_HOME/.local/share/applications/appimagekit-cheri.desktop 2>/dev/null || true
echo "   ✅ Desktop entries removed"
echo ""

# 5. Download fresh v1.0.3
echo "5️⃣  Downloading Cheri v${VERSION} (fresh)..."
mkdir -p $ACTUAL_HOME/.local/bin
cd $ACTUAL_HOME/.local/bin

if command -v wget &> /dev/null; then
    wget -O "${APPIMAGE_NAME}" "${DOWNLOAD_URL}"
elif command -v curl &> /dev/null; then
    curl -L -o "${APPIMAGE_NAME}" "${DOWNLOAD_URL}"
else
    echo "❌ Error: Neither wget nor curl found"
    exit 1
fi

chmod +x "${APPIMAGE_NAME}"
echo "   ✅ Downloaded ${APPIMAGE_NAME}"
echo ""

# 6. Create symlink
echo "6️⃣  Creating symlink..."
ln -sf "${APPIMAGE_NAME}" cheri
echo "   ✅ Symlink created: $ACTUAL_HOME/.local/bin/cheri"
echo ""

# 7. Create fresh desktop entry
echo "7️⃣  Creating fresh desktop entry..."
mkdir -p $ACTUAL_HOME/.local/share/applications

cat > $ACTUAL_HOME/.local/share/applications/cheri.desktop << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Cheri
Comment=AI that remembers your code
Exec=$ACTUAL_HOME/.local/bin/cheri --no-sandbox
Icon=cheri
Terminal=false
Categories=Development;IDE;
Keywords=ai;code;assistant;llm;
StartupWMClass=Cheri
EOF

# Fix ownership if run with sudo
if [ -n "$SUDO_USER" ]; then
    chown $ACTUAL_USER:$ACTUAL_USER $ACTUAL_HOME/.local/share/applications/cheri.desktop
    chown -R $ACTUAL_USER:$ACTUAL_USER $ACTUAL_HOME/.local/bin/
fi

echo "   ✅ Desktop entry created"
echo ""

# 8. Verify installation
echo "8️⃣  Verifying installation..."
if [ -f $ACTUAL_HOME/.local/bin/cheri ]; then
    FILE_SIZE=$(du -h $ACTUAL_HOME/.local/bin/${APPIMAGE_NAME} | cut -f1)
    echo "   ✅ Cheri v${VERSION} installed (${FILE_SIZE})"
    echo "   📁 Location: $ACTUAL_HOME/.local/bin/${APPIMAGE_NAME}"
else
    echo "   ❌ Installation failed"
    exit 1
fi

echo ""
echo "✅ Clean installation complete!"
echo ""
echo "🚀 Launch Cheri:"
echo "   - Command line: cheri"
echo "   - Full path: $ACTUAL_HOME/.local/bin/cheri"
echo "   - Applications menu: Search for 'Cheri'"
echo ""
echo "🍒 Version: ${VERSION} (with cherry branding)"
echo ""
echo "⚠️  IMPORTANT: Close any running Cheri windows before launching"
echo ""
read -p "Launch Cheri now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🍒 Launching Cheri..."
    nohup $ACTUAL_HOME/.local/bin/cheri --no-sandbox > /dev/null 2>&1 &
    sleep 2
    echo "✅ Cheri launched!"
    echo "   If you don't see the new cherry branding, try:"
    echo "   1. Close ALL Cheri windows"
    echo "   2. Run: pkill -f cheri"
    echo "   3. Launch again: cheri"
fi
