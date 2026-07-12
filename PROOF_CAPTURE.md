# Proof Capture

This file closes the remaining manual proof gaps as far as the repository can
help. It does not pretend to prove things the repo cannot prove on its own.
Instead, it gives you a repeatable way to capture the final Track 3 evidence
before submission.

## 1. Hosted Deployment Proof

Use the hosted-proof command against the final public app URL:

```bash
npm run proof:hosted -- https://your-final-app-url
```

Or set `PUBLIC_BASE_URL` in `.env` and run:

```bash
npm run proof:hosted
```

Paste the output into your submission notes or save it as a screenshot. The
command verifies:

- `GET /` returns `200`
- `GET /healthz` returns `200`
- `/healthz` responds with a GoSignal-shaped JSON payload

If you follow the current recommended hosting path, this will be your Render
service URL.

### Hosted Proof Record

- Hosted public URL:
- Proof captured at:
- Root status:
- Health status:
- Health payload screenshot or pasted JSON:

## 2. Marketplace Submission Proof

Track 3 still needs real Marketplace or distribution evidence captured by a
human. Fill this out after you submit the production app.

### Marketplace Record

- Final production App ID:
- Submission date:
- Submission time:
- Submission path:
- Screenshot path or link:
- Support URL:
- Privacy policy URL:
- Data retention URL:
- Interactivity request URL:
- Event request URL:
- OAuth redirect URL:

## 3. Five Active Workspace Proof

This is the most important remaining manual gap for the Organizations track.
Use one row per real workspace where GoSignal is installed and tested.

| Workspace | Installed by | Install date | Public launch channel | Analyzed launch name | Screenshot or note |
| --- | --- | --- | --- | --- | --- |
| Workspace 1 |  |  |  |  |  |
| Workspace 2 |  |  |  |  |  |
| Workspace 3 |  |  |  |  |  |
| Workspace 4 |  |  |  |  |  |
| Workspace 5 |  |  |  |  |  |

Minimum standard for each row:

- the app is installed
- the app is invited to a public channel
- one launch thread is analyzed
- App Home shows only that workspace's launches and audit history

## 4. Demo Evidence

Capture these before submission:

- the yellow-to-green thread flow
- one example of live search adding evidence from outside the thread
- the launch brief canvas
- App Home watchlist and workspace settings
- owner assignment or reminder flow
- launch history modal
- export brief modal

## 5. What Is Still Manual

The repository now gives you:

- a hosted verification command
- Marketplace/readiness docs
- a submission checklist
- the proof pack structure

The repository cannot auto-prove:

- a real Marketplace submission
- five real active workspaces
- screenshots from your final production app

Those must still be captured by you before the final hackathon submission.
