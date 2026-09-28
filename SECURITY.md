# Security checklist

we go gim is a static web app: no server, no accounts, no cookies, no payments, no AI. All data stays in the
browser (IndexedDB, with a localStorage fallback). The only outbound traffic is the optional feedback form
(Google Forms) and pdf.js from cdnjs (pinned, with SRI). Hosting is GitHub Pages.

Reviewed 2026-09-28. Re-check this list whenever one of the triggers below becomes true.

## Applies now (done)
| Item | Status |
|---|---|
| HTTPS / HSTS | GitHub Pages serves `Strict-Transport-Security: max-age=31556952` and redirects http → https. With a custom domain, tick "Enforce HTTPS" in the repo's Pages settings. |
| Upload types | Every file picker has an `accept` list. Imports are routed by content (magic bytes), not by name. Photos must be images under 40 MB and are re-encoded to a 1000 px JPEG, which also strips EXIF data such as GPS. Size caps: 25 MB for text/CSV, 60 MB for PDF, 200 MB for backups. |
| Request/input size | Line and length caps in the parsers. Feedback is capped at 4000 characters (also enforced in the form). Weights over 1500 kg and reps over 3600 are rejected. |
| Sanitise before storing | `sanitizeBackup` / `validateBackup` check every field of a restored backup (types, real dates, equipment, pauses). `cleanText` strips hidden characters. All output is HTML-escaped. CSV export neutralises spreadsheet formulas. |
| Content Security Policy | Set in index.html: scripts only from self and pinned pdf.js; connect-src limited to self, the feedback form and pdf.js; `object-src 'none'`; `form-action 'none'`; the app refuses to run inside another site's frame. |
| Directory listing | GitHub Pages returns 404 for folders (checked js/, anatomy/, tests/, .git/). Test files (.e2e) are excluded from git. |
| Default admin route | None exists. |
| Rate limiting | Feedback: 1 per minute and 10 per day per phone, offline queue capped. Form-side limits (regex, max length) are set in Google Forms. |
| Supply chain | three.js is vendored from npm three@0.169.0 with a verified integrity hash. pdf.js uses SRI, plus a hash-checked worker and `isEvalSupported:false`. |

## Not applicable today, with the trigger that makes each one relevant
| Item | Why not now | Becomes relevant when… |
|---|---|---|
| CSRF tokens | No server, no cookies, no state-changing requests to our own origin | a backend or API is added (e.g. cloud sync, accounts) |
| Reset session on password change, expire reset links, rate-limit password resets, prevent user enumeration, lock accounts after failed logins | No accounts or passwords | accounts / sign-in are added. Use a managed provider (e.g. Supabase Auth or Firebase Auth) that does these, and verify each one. |
| Secure cookie flags (Secure, HttpOnly, SameSite) | No cookies | any session cookie is set |
| Lock down CORS | No API of our own. Static files are public by design. | a backend/API exists: allow only the app's origin |
| Restrict database permissions | Data is on-device only (per-origin IndexedDB) | cloud sync: row-level security per user, least-privilege service keys, never ship admin keys to the client |
| Verify payment webhooks, set prices server side | No payments | paid features / Play Store billing: verify signatures, compute prices on the server |
| Block prompt injection, cap AI usage | No AI features | an AI coach or chat is added: treat user data and imported files as untrusted input, cap requests per user and day, and keep the API key on a server |
| Log security events | No server to log to | a backend exists: log sign-ins, failed logins, password changes and admin actions, without storing health data in logs |
| Google Form response sheet | Not verifiable from the code | now: make sure the responses sheet is private to the owner (it may contain contact details) |

## Open follow-ups
- Check that the Google Form's response spreadsheet is private (owner only).
- If a custom domain is used for the Play Store listing (Digital Asset Links), enable "Enforce HTTPS" and re-run this review.
