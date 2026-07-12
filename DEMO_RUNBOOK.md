# Demo Runbook

This runbook is designed for a clean, repeatable Track 3 demo using the
features that exist in the current repository.

## Demo Goal

Show that GoSignal can:

- analyze a real launch thread in Slack
- explain the readiness state
- apply the right launch profile
- identify a missing sign-off
- assign a human owner to close that gap
- create a durable launch brief canvas
- update the decision after the sign-off lands
- show workspace-scoped launch history, settings, and audit activity in App Home
- export the brief and open launch history without leaving Slack

## Recommended Demo Setup

- Use a public demo channel such as `#launch-demo`.
- Invite GoSignal to the channel before the recording.
- Make sure the app has already been installed in the workspace.
- Use the current bound app from `.slack/apps.dev.json` unless you have already
  switched to a production app.

## Seed Thread

Create a thread with messages similar to the following:

```text
PM: Launch: Mobile v3 checkout rollout
PM: Profile: SaaS release
PM: Target: Today 5:00 PM IST
PM: Please confirm launch readiness.

Engineering lead: Engineering approved for launch. @user
QA lead: QA signed off. @user
Ops lead: Rollback documented and ops approved. @user
PM: Release notes ready and shared.
Ops lead: Primary on call owner is @user.
PM: Waiting on support readiness approval.
```

This should produce a yellow state because support readiness is still missing.

## Demo Script

1. Open the seeded thread.
2. Use the `Analyze launch readiness` message shortcut.
3. Show the resulting readiness board in the thread.
4. Call out:
   - overall state
   - recommendation
   - launch profile
   - profile-specific evidence checks
   - missing sign-off
   - next action
5. Click `Open launch brief` and show the canvas.
6. Click `Assign owner` and assign support readiness to a real user.
7. Click `View history` and show the audit trail capturing that assignment.
8. Click `Request sign-off` and show the generated request text in the thread.
9. Optionally click `Remind owner` to show the follow-up flow.
10. Reply in the thread with a support sign-off, for example:

```text
Support readiness: Support readiness approved for launch. @user
```

11. Click `Re-run readiness`.
12. Show the state moving from yellow to green.
13. Open App Home and show:
    - the launch listed for the current workspace
    - the at-risk and missing sign-off watchlist
    - the current workspace search mode
    - the default launch profile
    - the recent audit events for analyze, assign owner, and rerun
14. Click `Export brief` and show the copy-ready launch export modal.

## Expected Demo States

Initial pass:

- overall state: yellow
- reason: missing support readiness sign-off
- next action: request support readiness approval and rerun

After support reply and rerun:

- overall state: green
- reason: required sign-offs are now present and no open blockers remain

## Current Demo Strength

This demo is already strong for:

- thread-first Slack UX
- deterministic and explainable readiness
- durable canvas output
- rerun flow
- App Home admin recap

## Strongest Final Video

The strongest Track 3 video now shows search evidence as a load-bearing part of
the product. Record one blocker or dependency found outside the current thread
and then show it folding into the readiness board, the evidence receipts, and
the launch brief canvas.

## Fallback Plan

If the live Slack thread is messy or inconsistent:

- create a new public channel
- reseed the exact thread above
- rerun the shortcut

If LLM wording varies:

- rely on the deterministic state, blocker, and sign-off explanation
- keep the demo focused on the decision and workflow, not the phrasing style
