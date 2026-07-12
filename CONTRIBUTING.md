# Contributing

Thanks for contributing to GoSignal.

## Local Workflow

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and add local Slack credentials.
3. Run `npm run dev` or `npm run dev:watch`.
4. Before pushing changes, run:

```bash
npm run verify
npm run smoke
```

If you are changing the optional LLM path, also run:

```bash
npm run check:llm
```

## Contribution Guidelines

- Keep the deterministic readiness engine authoritative.
- Treat LLM output as optional phrasing, not the source of truth.
- Preserve workspace scoping in repository queries and UI flows.
- Do not commit secrets, tokens, or private screenshots.
- Update docs when the install, deployment, or Marketplace posture changes.

## Pull Request Checklist

- Code builds from the production path.
- Tests pass.
- Smoke test passes.
- New behavior is documented if it changes setup, deployment, or submission
  proof.

## Reporting Issues

- General issues: `https://github.com/BitTriad/GoSignal/issues`
- Do not post secrets or live credentials in public issues.
