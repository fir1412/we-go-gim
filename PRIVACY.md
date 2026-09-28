# Privacy

**Short version: we go gim collects nothing. Your data never leaves your phone unless you send it somewhere yourself.**

- **No accounts, no servers, no analytics, no ads, no trackers.** The app is a set of static files; once installed it runs offline.
- **Where your data lives:** workouts, weigh-ins, cardio, programme and settings are stored in your browser's storage on your device (IndexedDB). The developer cannot see or access it.
- **Network requests:** the app downloads its own files from GitHub Pages (GitHub may log standard web-server data such as IP address, per GitHub's privacy statement). When you import a PDF, the PDF reader library is downloaded from cdnjs (Cloudflare). Nothing about you or your workouts is sent in either case.
- **Feedback:** if you choose More → Send feedback, your message, optional contact and a short line of app info (version, phone type, browser, current screen) are sent to the developer's Google Form, where Google's privacy terms apply. Nothing from your workouts or body data is included.
- **Backups and exports** are files you create and choose where to send (for example Google Drive). Once shared, that service's privacy terms apply.
- **Deleting your data:** More → Backup and export → Erase everything, or clear the site's data in Chrome, or uninstall the app. There is no copy anywhere else.
- **Health information:** body weight, pain flags and notes are health-related. Because they stay on your device, no one else processes them.

Questions: open an issue on the GitHub repository.
