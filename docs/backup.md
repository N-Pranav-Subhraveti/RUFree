# GitHub source backup

Repository: https://github.com/N-Pranav-Subhraveti/RUFree

The repository backs up source code, migrations, tests, pinned dependencies, requirements, release notes and operational documentation. Its existing license history is preserved. The repository is public.

Secrets, `.dev.vars`, `.env` files, `deployment.local.json`, local databases, runtime logs, dependencies, generated builds and browser-test artifacts are excluded. This is a source backup, not a backup of production D1 records or credentials.

## Restore development

1. Clone the repository and install a supported Node version (see package.json).
2. Run `npm ci`.
3. Run `npm run db:migrate:local` and `npm run dev` for the isolated local workspace.
4. For optional local Google authentication, copy `.dev.vars.example` to `.dev.vars` and supply credentials privately. Never commit the filled file.
5. Run the checks listed in README.md.

## Production recovery

Recover production data separately through Cloudflare D1 recovery procedures. Restore the ignored deployment configuration using the account/database identifiers and approved scope in docs/release.md, and authenticate Wrangler for the intended account. Recover credentials from their secure source, never from GitHub. Review schema compatibility before any migration or rollback; the local development database must never replace production D1.

## Future source backups

Review `git status` and the staged diff, confirm ignored secrets remain excluded, then commit and push to `origin`. Never force-push over newer remote work. This backup does not configure an automatic schedule.
