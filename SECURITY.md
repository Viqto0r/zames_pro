# Security Policy

## Reporting a vulnerability

Please do NOT open a public issue for security problems. Report them privately
to the maintainer (open a GitHub security advisory on the repository, or email
the address in `package.json`). Include a description, steps to reproduce and
the affected version.

## Scope and threat model

zames is a local CLI that drives a browser and runs tools on your machine. It
is not a sandbox:

- File tools are confined to the working directory: `../` traversal is rejected
  AND a symlink pointing outside the root is rejected (the real path is
  resolved with `fs.realpath`). This is a guard against accidents and the
  common escape vectors, not full OS isolation — `Bash` runs a real shell as
  your user. Treat every task you give the agent as code you are willing to
  run.
- The DeepSeek credentials in `~/.zames/config.json` and the browser profile
  in `~/.zames/profile` are sensitive. They never leave your machine. Files
  written by the agent's own state/config writers are created with `0600`
  permissions, but files created by your own tools or by `Bash` follow your
  umask.
- `WebFetch` blocks private/loopback/link-local addresses (including the cloud
  metadata endpoint `169.254.169.254`) to limit SSRF, and it RE-VALIDATES every
  redirect hop. This remains best-effort (a DNS rebind between the check and
  the fetch is out of scope).
- **Permissions** (`.zames/permissions.json`): an optional policy file with
  `deny` / `ask` / `allow` rules on the tool name, a Bash command or a file
  path. `deny` blocks a call, `ask` prompts you in the terminal (a non-TTY run
  denies). If you do not create the file, every tool runs without asking — the
  default is `allow`. Path rules are matched against the `path`-style args of
  the built-in tools, against the file headers of an `ApplyPatch`, and against
  path-looking string arguments of MCP tools; a rule cannot see inside an
  arbitrary Bash command.
- **Plan / read-only mode** (`--plan`, `/plan`) removes the mutating built-in
  tools from the model's tool set. Since this release it also drops MCP tools
  whose names look mutating (click/type/write/...); the classification is a
  heuristic deny-list, so treat plan mode as a strong hint rather than a hard
  guarantee for third-party MCP servers.
- `Write`/`Edit` and the multi-file tools keep a backup (`/undo`,
  `/undo-list`), but that is an undo safety net, not a security boundary. Give
  the agent only tasks you are willing to run.

## Supported versions

Only the latest published version receives fixes.
