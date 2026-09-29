# Deploy BAHM using the Cloudflare dashboard

## 1. Create the database

Go to **Storage & databases → D1 SQL Database → Create database**. Name it `bahm-assessments` and copy its Database ID. If it already exists, use that database. Keep the ID out of the repository; `wrangler.jsonc` retains its local placeholder.

## 2. Connect GitHub

The repository changes described here must be pushed to GitHub before building.

In **Workers & Pages**, create a Worker by importing `maxim-kich/being-ass-hole-manager` from GitHub. Use:

| Setting | Value |
| --- | --- |
| Worker name | `being-ass-hole-manager` |
| Root directory | Repository root |
| Build command | `npm test && npm run build` |
| Deploy command | `npm run db:migrate:remote && npm run deploy` |

Use Node.js 22 or later. Cloudflare installs dependencies from the checked-in npm lockfile. The build token needs D1 edit permission for migrations, Worker deployment permission, and permission to configure the custom domain.

## 3. Add the build variable and runtime secrets

In the build setup, or **Worker → Settings → Builds → Variables and secrets**, add:

| Build variable | Value |
| --- | --- |
| `D1_DATABASE_ID` | The UUID copied from D1 |

Save and retry the build if the initial build started before the variable was added. Do not add this under runtime Variables and Secrets: the deployment process needs it before the Worker runs. The scripts generate an ignored temporary configuration for both migrations and deployment and remove it afterward. The ID is never added to frontend assets or the tracked configuration. Wrangler may display it in private build logs.

In **Worker → Settings → Variables and Secrets**, add these as **Secret** and deploy the settings:

| Runtime secret | Value |
| --- | --- |
| `JEV_API_KEY` | Your TypeSafe API key with available credits |
| `ADMIN_PASSWORD` | A long, unique password saved in your password manager |

The site can deploy before these secrets are entered, but assessments and admin login will not work until they are set. `.dev.vars` is local-only and is not uploaded.

`JEV_MODEL=jev-latest`, `SITE_URL=https://bahm.maximkich.com`, the `DB` binding, static assets, and rate limit bindings are configured automatically. You do not need to add them manually.

Make sure `maximkich.com` is an active zone in the same Cloudflare account. Deployment attaches `bahm.maximkich.com` as a Custom Domain and Cloudflare provisions DNS and HTTPS. Resolve any conflicting record for that subdomain without changing your apex website records. Worker preview URLs and workers.dev are disabled.

The deploy command applies all database migrations before publishing. Local stories are not uploaded; production starts empty. Search indexing remains disabled, while social crawlers can fetch metadata and preview images.

## 4. Verify production

After Cloudflare reports successful deployment and the HTTPS certificate is active:

- Open `https://bahm.maximkich.com/`, `/terms`, and `/impressum`; check footer links.
- Open `/fucked-up-stories`, sign in with the admin password, and sign out.
- Submit one fictional management story. Refresh its `/results/<uuid>` URL and open its copied `/s/<code>` link in a new browser session.
- View page source on the homepage and result page. Canonical and `og:url` must use `https://bahm.maximkich.com`; `og:image` and `twitter:image` must point to `/share/home.png`, `/share/yes.png`, or `/share/no.png` on that domain.
- Open all three social PNG URLs. They should return PNG images sized 1200 × 630.
- Open `/wrong/page` and a nonexistent `/results/<uuid>`; both should return HTTP 404.
- Confirm `/api/gallery` returns JSON without errors. An empty gallery is expected until you feature a story.

Do not treat the local test suite as proof of production DNS, secrets, database bindings, or a real provider call.

## Later deployments

Push changes to the connected production branch to rebuild and deploy. Keep the same build variable and runtime secrets. Do not connect preview branches to the production database/domain.

For an optional local CLI deployment, supply `D1_DATABASE_ID` in your shell environment before running `npm run db:migrate:remote` and `npm run deploy`. Never replace the committed placeholder with the production ID.

## References

- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/d1/get-started/
