#!/bin/sh
set -e
cd "$(dirname "$0")/.."
swift scripts/svg-to-png.swift assets/logo/app-icon.svg companion-app/icons/icon.png 512
swift scripts/svg-to-png.swift assets/logo/tray-light.svg companion-app/icons/tray-light.png 106x44
swift scripts/svg-to-png.swift assets/logo/tray-dark.svg companion-app/icons/tray-dark.png 106x44
