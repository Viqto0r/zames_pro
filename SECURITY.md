# Security Policy

## Reporting a vulnerability

Please do NOT open a public issue for security problems. Report them privately
to the maintainer (open a GitHub security advisory on the repository, or email
the address in `package.json`). Include a description, steps to reproduce and
the affected version.

## Scope and threat model

zames is a local CLI that drives a browser and runs tools on your machine. It
is not a sandbox:

- File tools are confined to the working directory (path traversal is
  rejected), but `Bash` runs a real shell as your user. Treat every task you
  give the agent as code you are willing to run.
- The DeepSeek credentials in `~/.zames/config.json` and the browser profile
  in `~/.zames/profile` are sensitive. They never leave your machine.
- `WebFetch` blocks private/loopback/link-local addresses (including the cloud
  metadata endpoint `169.254.169.254`) to limit SSRF, but this is best-effort
  (a DNS rebind between the check and the fetch is out of scope).
- Confirmation prompts (Write/Edit/Bash + the `alwaysConfirm` regex list) are a
  safety net, not a security boundary. Review them in `/permissions`.

## Supported versions

Only the latest published version receives fixes.
