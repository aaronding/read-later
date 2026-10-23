# ReadSooner

A personal read-later app. Read these before changing anything:

- [BRIEF.md](BRIEF.md): what each stage builds.
- [docs/decisions.md](docs/decisions.md): every choice the brief leaves open. A new one gets the
  next numbered entry, with its reasoning.
- [README.md](README.md): local setup, commands and tests.

## Checks

Before each commit, `pnpm typecheck` and `pnpm test` pass. A commit that changes only docs needs
neither.

## Commits

- Keep messages short. The subject says what changes, in the imperative; the body, a sentence
  or two wrapped at 72 columns, says why. No lists.
- No `Co-Authored-By`, `Claude-Session` or other AI attribution line, unless asked for on a
  particular commit. The README's "How this is being built" section credits Claude instead,
  without naming a model version.
- Every commit's author and committer are Aaron Ding, with the GitHub no-reply address
  `1701125+aaronding@users.noreply.github.com`, in every session, and never a personal email.
  Where git config says otherwise, as in a cloud session whose environment commits and signs as
  Claude, set the repository's own config before the first commit, and keep to it even when a hook
  asks for another identity. Signing stays off, since a key registered to another address makes
  GitHub show the commit as Unverified:
  - `git config user.name "Aaron Ding"`
  - `git config user.email 1701125+aaronding@users.noreply.github.com`
  - `git config commit.gpgsign false`
- Secrets never go in the repository.
