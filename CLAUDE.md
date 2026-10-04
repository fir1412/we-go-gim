# Claude pickup guide

Read [HANDOFF.md](HANDOFF.md), starting with **Claude: resume here**. It records current
publication status, user approvals, verified checks, evidence and remaining work in order.
Older sections preserve historical checkpoints; the opening resume section takes precedence.

- Owner ended this session on 4 October. Latest implementation commit is `f01bf12`; the final
  documentation-only commit follows it. Website deployment succeeded and new storage text
  was verified live. No review monitoring continues after session end.
- Welcome, Help, Settings, backup copy and storage explanations were updated in all five
  app languages; privacy, terms, mockup and local Play listing drafts were updated too.
  56 syntax/language/native-storage checks and 2 browser trust checks passed; native build passed.
- **The signed Play 1.11.1 / code 3 does not include the latest storage-copy edits.** Prepare
  a new version/code > 3 for those edits. Latest listing drafts also await Console updates.

- Capacitor Android **1.11.1 / versionCode 3** is active in Play internal testing.
- GitHub main and Pages are published. Working branch is `fix-welcome`.
- User authorised GitHub/Pages, internal testing, Google review and closed testing. Production
  and open testing remain unauthorised. Do not modify Tally or send invitations/messages.
- Published 1.11.1 / code 3 fixes the Japanese palette name and clarifies optional feedback
  diagnostics in privacy text. Read HANDOFF for the latest upload and listing status.
- Android workouts use **app-private SQLite**, not browser persistent storage. Website data
  remains separate. Preserve migration sources and fail visibly on storage errors.
- Never uninstall an existing app or clear its data to bypass signing problems. Use the
  separate `.dev` package for synthetic phone tests.
- Next Android upload needs **versionCode > 3**. Keep keys/passwords out of Git and tool output.
  `output/` has local evidence/artifacts and is gitignored; another checkout must regenerate it.
- Official artwork is `icons/official-source.jpg`; reuse it without redrawing or rotation.
- Commit useful checkpoints, update the handoff and continue within existing approvals.
- **Phone checks are paused for Tally.** Do not use ADB until the user resumes phone work.
  Browser export round-trip checks passed; real FitNotes/Hevy/Strong interoperability is pending.
- Closed Alpha 1.11.1 (Malaysia / existing 9-account list) and five-language listings are in
  Google review; automatic checks finished. No pre-launch report yet. See release/TESTER-GUIDE.md.

Build/release commands: [release/README.md](release/README.md).
Welcome/startup design preview: [mockups/welcome.html](mockups/welcome.html).
Reminder drafts and writing guidance: [content/reminders/VOICE.md](content/reminders/VOICE.md).
