# Claude pickup guide

Read [HANDOFF.md](HANDOFF.md), starting with **Claude: resume here**. It records current
publication status, user approvals, verified checks, evidence and remaining work in order.
Older sections preserve historical checkpoints; the opening resume section takes precedence.

- Capacitor Android **1.11.0 / versionCode 2** is active in Play internal testing.
- GitHub main and Pages are published. Working branch is `fix-welcome`.
- User authorised GitHub/Pages and internal testing; closed/open/production releases require
  further authority. Do not modify Tally or send invitations/messages.
- Android workouts use **app-private SQLite**, not browser persistent storage. Website data
  remains separate. Preserve migration sources and fail visibly on storage errors.
- Never uninstall an existing app or clear its data to bypass signing problems. Use the
  separate `.dev` package for synthetic phone tests.
- Next Android upload needs **versionCode > 2**. Keep keys/passwords out of Git and tool output.
  `output/` has local evidence/artifacts and is gitignored; another checkout must regenerate it.
- Official artwork is `icons/official-source.jpg`; reuse it without redrawing or rotation.
- Commit useful checkpoints, update the handoff and continue within existing approvals.

Build/release commands: [release/README.md](release/README.md).
Welcome/startup design preview: [mockups/welcome.html](mockups/welcome.html).
Reminder drafts and writing guidance: [content/reminders/VOICE.md](content/reminders/VOICE.md).
