#!/usr/bin/env bash
set -euo pipefail

if ! command -v security >/dev/null 2>&1; then
  echo "The macOS 'security' command-line tool is required" >&2
  exit 1
fi

required_envs=(
  MACOS_CERT_P12
  MACOS_CERT_PASSWORD
  APPLE_API_KEY_ID
  APPLE_API_ISSUER
)

for var in "${required_envs[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required environment variable: ${var}" >&2
    exit 1
  fi
done

APPLE_API_KEY_DATA="${APPLE_API_KEY_CONTENTS:-${APPLE_API_KEY:-}}"
if [[ -z "${APPLE_API_KEY_DATA}" ]]; then
  echo "Set APPLE_API_KEY (preferred) or APPLE_API_KEY_CONTENTS to the raw contents of your App Store Connect API key (.p8)." >&2
  exit 1
fi

KEYCHAIN_NAME="${KEYCHAIN_NAME:-build.keychain-db}"
KEYCHAIN_PASS="${KEYCHAIN_PASS:-$(openssl rand -hex 16)}"
KEYCHAIN_TIMEOUT="${KEYCHAIN_TIMEOUT:-3600}"
APP_NAME="${APP_NAME:-BrilliantCode}"
NOTARIZE_TARGET="${NOTARIZE_TARGET:-dmg}"

API_KEY_DIR="${RUNNER_TEMP:-/tmp}/.appstore"
API_KEY_PATH="${API_KEY_DIR}/AuthKey_${APPLE_API_KEY_ID}.p8"

CERT_P12_PATH=$(mktemp /tmp/macos-cert-XXXXXX.p12)

# Capture current keychain state for cleanup (compatible with bash 3.x)
EXISTING_KEYCHAINS=$(security list-keychains -d user 2>/dev/null | tr -d '"')
DEFAULT_KEYCHAIN=$(security default-keychain -d user 2>/dev/null | tr -d '"')

cleanup() {
  local exit_code=$?
  set +e
  if [[ -n "${EXISTING_KEYCHAINS}" ]]; then
    # shellcheck disable=SC2086 # word splitting is intentional to pass each path as an argument
    security list-keychains -d user -s ${EXISTING_KEYCHAINS} >/dev/null 2>&1 || true
  fi
  if [[ -n "${DEFAULT_KEYCHAIN}" ]]; then
    security default-keychain -s "${DEFAULT_KEYCHAIN}" >/dev/null 2>&1 || true
  fi
  security delete-keychain "${KEYCHAIN_NAME}" >/dev/null 2>&1 || true
  rm -f "${CERT_P12_PATH}"
  rm -f "${API_KEY_PATH}"
  rmdir "${API_KEY_DIR}" >/dev/null 2>&1 || true
  exit "${exit_code}"
}
trap 'cleanup' EXIT

mkdir -p "${API_KEY_DIR}"

# Write API key to disk with restricted permissions
printf '%s' "${APPLE_API_KEY_DATA}" > "${API_KEY_PATH}"
chmod 600 "${API_KEY_PATH}"

# Decode the base64-encoded Developer ID certificate into a temporary file
echo "${MACOS_CERT_P12}" | base64 --decode > "${CERT_P12_PATH}"

# Create and configure dedicated keychain
security create-keychain -p "${KEYCHAIN_PASS}" "${KEYCHAIN_NAME}"
security set-keychain-settings -lut "${KEYCHAIN_TIMEOUT}" "${KEYCHAIN_NAME}"
security unlock-keychain -p "${KEYCHAIN_PASS}" "${KEYCHAIN_NAME}"
security list-keychains -d user -s "${KEYCHAIN_NAME}" "${EXISTING_KEYCHAINS[@]}"
security default-keychain -s "${KEYCHAIN_NAME}"

# Import Developer ID certificate and grant access
echo "Imported Developer ID certificate:" >&2
security import "${CERT_P12_PATH}" -k "${KEYCHAIN_NAME}" -P "${MACOS_CERT_PASSWORD}" -T /usr/bin/codesign -T /usr/bin/productbuild
security set-key-partition-list -S apple-tool:,apple: -s -k "${KEYCHAIN_PASS}" "${KEYCHAIN_NAME}"
security find-identity -p codesigning -v "${KEYCHAIN_NAME}" || true

# Export notarization environment variables for forge
export APPLE_API_KEY="${API_KEY_PATH}"
export APPLE_API_KEY_ID
export APPLE_API_ISSUER

# Export signing configuration for electron-builder
export CSC_IDENTITY_AUTO="${CSC_IDENTITY_AUTO:-true}"
export CSC_KEY_PASSWORD="${MACOS_CERT_PASSWORD}"
export KEYCHAIN_NAME

# Enable verbose logging for macOS signing stack and electron-builder
export DEBUG="electron-osx-sign*,electron-notarize*,@electron/osx-sign*,@electron/notarize*,electron-builder"
export NOTARIZE_TARGET

echo "======================================" >&2
echo "Running electron-builder packaging flow" >&2
echo "Current working directory: $(pwd)" >&2
echo "Node version: $(node --version)" >&2
echo "npm version: $(npm --version)" >&2
echo "======================================" >&2

set -x
if [[ $# -gt 0 ]]; then
  npm run dist -- "$@"
  BUILDER_EXIT=$?
else
  npm run dist
  BUILDER_EXIT=$?
fi
set +x

if [[ ${BUILDER_EXIT} -ne 0 ]]; then
  echo "ERROR: electron-builder failed with exit code ${BUILDER_EXIT}" >&2
  exit ${BUILDER_EXIT}
fi

echo "======================================" >&2
echo "electron-builder completed successfully" >&2
echo "======================================" >&2

# List all produced artifacts
echo "======================================" >&2
echo "Listing all build artifacts:" >&2
echo "======================================" >&2
find release -type f 2>/dev/null || echo "No 'release' directory found" >&2
echo "======================================" >&2

DMG_PATHS=()
if [[ -d release ]]; then
  while IFS= read -r -d '' dmg; do
    DMG_PATHS+=("$dmg")
  done < <(find release -type f -name '*.dmg' -print0)
fi

if [[ "${NOTARIZE_TARGET}" == "dmg" && ${#DMG_PATHS[@]} -gt 0 ]]; then
  echo "Submitting DMG artifacts for notarization:" >&2
  for dmg_path in "${DMG_PATHS[@]}"; do
    echo "  - ${dmg_path}" >&2
    if ! xcrun notarytool submit "${dmg_path}" \
      --key "${APPLE_API_KEY}" \
      --key-id "${APPLE_API_KEY_ID}" \
      --issuer "${APPLE_API_ISSUER}" \
      --wait; then
      echo "ERROR: Notarization failed for ${dmg_path}" >&2
      exit 1
    fi

    echo "Stapling notarization ticket to ${dmg_path}" >&2
    xcrun stapler staple "${dmg_path}" || {
      echo "WARNING: Stapler failed for ${dmg_path}, but continuing" >&2
    }
    spctl --assess --type open --verbose "${dmg_path}" || {
      echo "WARNING: Security assessment failed for ${dmg_path}, but continuing" >&2
    }
  done
else
  if [[ "${NOTARIZE_TARGET}" == "dmg" ]]; then
    echo "WARNING: NOTARIZE_TARGET=dmg but no DMG artifacts were found under release/. Falling back to .app stapling." >&2
  fi
fi

# Staple and validate if an app bundle exists
APP_PATH=$(ls -d release/"${APP_NAME}"-mac-*/"${APP_NAME}.app" 2>/dev/null | head -n 1 || true)
if [[ -n "${APP_PATH}" ]]; then
  if [[ "${NOTARIZE_TARGET}" != "dmg" || ${#DMG_PATHS[@]} -eq 0 ]]; then
    echo "Stapling notarization ticket to ${APP_PATH}" >&2
    xcrun stapler staple "${APP_PATH}" || {
      echo "WARNING: Stapler failed, but continuing" >&2
    }
    spctl --assess --type execute --verbose "${APP_PATH}" || {
      echo "WARNING: Security assessment failed, but continuing" >&2
    }
  else
    echo "Skipping .app stapling because DMG notarization completed." >&2
  }
else
  echo "WARNING: No .app bundle found in release/*/${APP_NAME}.app" >&2
fi

# Persist environment for downstream GitHub Action steps (optional)
if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    echo "APPLE_API_KEY=${APPLE_API_KEY}"
    echo "KEYCHAIN_NAME=${KEYCHAIN_NAME}"
  } >> "${GITHUB_ENV}"
fi
