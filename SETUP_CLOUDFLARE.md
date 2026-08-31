# Cloudflare and GitHub setup

The repository is ready for Cloudflare Workers, D1, R2, GitHub Actions, and
Cloudflare Access. The steps below are required once for a new Cloudflare
account or domain.

## 1. Create the GitHub repository

Create an empty GitHub repository and push this folder to its `main` branch.
Do not add DEGIRO CSV files to Git.

## 2. Create Cloudflare storage

Install dependencies and authenticate Wrangler:

```bash
npm ci
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create stonks-portfolio
```

The command returns a `database_id`. Replace the all-zero `database_id` in
`wrangler.jsonc` with that value. The ID is configuration, not a secret.

Create the private R2 bucket:

```bash
npx wrangler r2 bucket create stonks-portfolio-data
```

R2 must be enabled in the Cloudflare account. Public access to this bucket is
not required and should remain disabled.

## 3. Test the first deployment

Apply the database migration and deploy:

```bash
npx wrangler d1 migrations apply stonks-portfolio --remote --config wrangler.jsonc
npm run deploy
```

Add a custom domain to the deployed Worker in Cloudflare. A hostname such as
`portfolio.example.com` is suitable.

## 4. Configure account login

Open Cloudflare Zero Trust and enable the **One-time PIN** login method under
Settings > Authentication > Login methods. Another supported identity provider
can be used instead.

Create one Self-hosted Access application with this protected hostname and
path:

```text
portfolio.example.com/dashboard*
```

Add an **Allow** policy. It can allow selected email addresses, an email domain,
or everyone who successfully uses the chosen identity provider. The root page
remains public and shows the application login screen. Selecting **Continue
with email** opens the protected dashboard and starts Cloudflare Access.

The portfolio APIs are deliberately exposed at `/dashboard/api/*`, so the same
Access application protects both the interface and all private data requests.
Direct `/api/*` requests are blocked by the Worker.

## 5. Connect GitHub Actions

Create a Cloudflare API token with the minimum permissions needed to edit
Workers, D1, and R2 for this account. Add these repository secrets in GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Commit the real D1 database ID in `wrangler.jsonc` and push to `main`. The
workflow then runs type checks, calculation tests, the production build, D1
migrations, and the Worker deployment.

## 6. First use

Open the root URL, sign in, and go to **Data & privacy**. Upload fresh full
exports of:

- `Portfolio.csv`
- `Account.csv`
- `Transactions.csv`

Then use **Refresh prices**. The app tries to discover Yahoo Finance symbols
from each ISIN. Review ambiguous listings under **Instrument symbol mappings**.

## Security notes

- Never configure `DEV_USER_EMAIL` in Cloudflare production.
- Keep R2 private and protect the complete `/dashboard*` path with Access.
- Do not weaken the server-side identity checks in `lib/auth.ts`.
- Use a narrowly scoped Cloudflare API token in GitHub.
- Users can remove their own CSV files, mappings, and market cache from the
  **Data & privacy** page.
