# Human Health Monitor

A standalone HTML dashboard reconstructed from HumanHealthMonitor 1.0's Android layouts and assets.

## Run
Serve this directory with any static web server. The entry point is index.html. No build step, backend, or account login is required by the application.

## Features
- Original-style Scan, History, Users, and report screens
- 40-second live sensor measurements and pulse waveform; no simulated fallback
- Session-only profiles, history, and CSV export
- Web Bluetooth connection using FF01 commands, FF02 replies and FF03 measurement notifications from the recovered device protocol

## Limitations
Bluetooth requires a supported browser and HTTPS (or localhost). Hardware integration has not been validated. The original sensor validity algorithm is not fully reproduced. Blood-pressure values are estimates calculated from heart rate, not blood-pressure measurements. No clinical score or diagnosis is provided.

Profiles and reports remain in memory and are cleared on reload or tab closure. The app does not send measurements to a server.

## GitHub Pages
Upload these files to a repository, then select Settings > Pages > Deploy from a branch, with main and the repository root. GitHub account and plan restrictions may affect availability.

## Assets
Logos and metric icons were extracted from the user-supplied APK. No third-party ownership or license is claimed, and no open-source license has been assigned to those assets.
