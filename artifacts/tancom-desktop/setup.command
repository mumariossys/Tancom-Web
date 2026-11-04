#!/bin/bash
# TanCom Desktop — macOS setup script
# Double-click this file in Finder to build TanCom.dmg automatically.
# If macOS says "cannot be opened", right-click → Open → Open anyway.

# Change to the script's own directory so relative paths work when
# double-clicked from Finder (Finder sets CWD to ~, not the script folder).
cd "$(dirname "$0")"

echo ""
echo " ========================================="
echo "   TanCom Desktop  |  macOS Setup"
echo " ========================================="
echo ""

# ── Step 0: Check for Node.js ────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo " [!] Node.js is not installed."
  echo ""
  echo " Please install Node.js from https://nodejs.org (LTS version)"
  echo " or run:  brew install node"
  echo ""
  open "https://nodejs.org"
  echo " Press any key to exit once Node.js is installed, then run this script again."
  read -n 1
  exit 1
fi

echo " [OK] Node.js $(node --version) found"
echo ""

# ── Step 1: Install dependencies ─────────────────────────────────────────────
echo " [1/3] Installing dependencies..."
echo "       (first run may take 2-3 minutes)"
echo ""
npm install || { echo ""; echo " [!] npm install failed."; read -n 1; exit 1; }
echo ""

# ── Step 2: Build the macOS installer ────────────────────────────────────────
echo " [2/3] Building TanCom.dmg..."
echo ""
npm run dist:mac || { echo ""; echo " [!] Build failed."; read -n 1; exit 1; }
echo ""

# ── Step 3: Open the release folder ──────────────────────────────────────────
echo " [3/3] Done! Opening the release folder..."
open release/ 2>/dev/null || true
echo ""
echo " ========================================="
echo "   TanCom.dmg is ready in release/"
echo ""
echo "   Open it and drag TanCom to Applications"
echo "   to install."
echo " ========================================="
echo ""
read -n 1 -s -r -p " Press any key to close..."
echo ""
