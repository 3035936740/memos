# Security policy

## Scope and supported versions

This policy covers [Memos Plus](https://github.com/3035936740/memos-plus), an independently maintained, unofficial derivative of Memos. Upstream Memos maintainers are not the security contacts for this project.

Memos Plus has its own release versions. The upstream schema version embedded in the application is not its release version. There is currently no published multi-version support window or backport guarantee. Before upgrading, review release notes, back up your database and files, and verify the upgrade on a separate copy.

## Private reporting channel: maintainer setup required

As of October 30, 2026, this repository's private reporting channel has not been verified. No project security email address has been established in this policy, and GitHub private vulnerability reporting has not been confirmed as enabled.

The maintainer, [@3035936740](https://github.com/3035936740), needs to enable and verify **Settings → Code security → Private vulnerability reporting**, or publish another verified private reporting channel, then update this policy with the working contact instructions.

Until a private channel is available, do not publish vulnerability details, exploit instructions, credentials, or sensitive logs. Public issues, pull requests, and discussions are not private reporting alternatives. The upstream security email is not a Memos Plus reporting channel.

Once a verified private channel is listed here, please include:

- The Memos Plus version or commit and deployment method.
- A clear description, affected component, and reproduction steps.
- Expected and actual behavior, impact, and sanitized logs.
- Any suggested mitigation or fix.

This policy does not promise a response deadline, a CVE assignment, or a fixed disclosure schedule.

## Deployment precautions

- Restrict access to trusted administrators and protect AI provider credentials and custom scripts.
- Use HTTPS and appropriate authentication when exposing the service to the internet.
- Keep consistent database and attachment backups, and test recovery separately.
- Use separate data for resettable demo mode; never point it at production data.
