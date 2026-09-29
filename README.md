## Slop-Disclaimer

It's a vibe coded experiment with new JEV model. You can self host it locally or deploy it on preferred platform.

Use it as you wish. There is no contribution expected. And of course this readme was not meant to be read by humans, let your agent read and explain it for you.

# Being A-Hole Manager (BAHM)

Describe a management situation and get an assessment from JEV, the TypeSafe AI model. The interface presents a verdict, confidence, and six behavior scales: transparency, fairness, autonomy, accountability, respect, and support. JEV checks relevance and sufficient information before producing an assessment; there are no keyword-based fallback verdicts.

Built with browser-native HTML/CSS/JavaScript, a Cloudflare Worker, and D1. Saved results have permanent links, and an authenticated administration panel can curate stories for the homepage.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set JEV_API_KEY and a long, unique ADMIN_PASSWORD in .dev.vars.
npm run dev
```

Open http://localhost:8788. The dev command applies local database migrations automatically. Without a TypeSafe API key, you can view the interface and static review pages, but cannot generate assessments.

Local D1 records persist in `.wrangler/state/`. Credentials, local databases, build output, and agent workspace files are git-ignored. Never put credentials in frontend code. The database ID in `wrangler.jsonc` is a placeholder for local development.

## Deploy to Cloudflare

Production target: **https://bahm.maximkich.com**. Follow [the deployment guide](DEPLOYMENT.md) for account setup, database creation, runtime secrets, domain routing, and production verification.

The included deployment targets **Cloudflare Workers with static assets and D1**. Hosting elsewhere requires adapting the Worker request handler, database binding, asset serving, and rate limit bindings to that platform.

Use the Cloudflare dashboard workflow in [DEPLOYMENT.md](DEPLOYMENT.md). Store the database UUID as the **build variable** `D1_DATABASE_ID`; keep the all-zero placeholder in the public `wrangler.jsonc`. The deployment scripts generate an ignored temporary configuration and remove it afterward. Remote migrations and deployment fail clearly if the variable is missing or invalid. Local development and dry-run builds work without it.

Runtime secrets `JEV_API_KEY` and `ADMIN_PASSWORD` belong in the Worker's Variables and Secrets settings. They are separate from build variables. Local database records are not copied to production.

## Behavior and stored data

- Stories are limited to 500 whitespace-separated words. The server also enforces a 40 KB request-body limit.
- Each new assessment makes one JEV request. Reopening a saved result does not call the model again. Submission IDs prevent duplicate assessment requests on retries.
- D1 stores the submitted story, original model response, timestamps, processing status, model, and response version. Saved results are accessible to anyone with their URL. Stories are sent to TypeSafe for processing.
- Scores are presented on a 1–5 scale, with higher values indicating more constructive behavior. Confidence is displayed separately. Explanations and rubric descriptions are authored interface copy.
- The Cloudflare rate limiter allows one new assessment attempt per IP per minute. A D1 trigger caps new attempts at 7,000 per UTC day. Failed provider calls retain their daily slot. Configure provider spending controls for your deployment.
- Search indexing is disabled by default. Social-preview crawlers can access the relevant pages and images. Crawler rules do not restrict access to saved stories.
- No visitor account is required. There is no visitor self-service editing or deletion. Operators handle removal requests.

## Story curation

Open `/fucked-up-stories` and sign in with `ADMIN_PASSWORD` to review submissions, edit their public story text and title, and feature or unfeature completed assessments. Nothing is featured automatically. The original story remains available to the administrator; the assessment remains based on that original submission.

Admin APIs require authenticated sessions. Session tokens are stored as hashes, expire after eight hours, and are revoked on sign-out. Cookies are HttpOnly and SameSite=Strict, with Secure enabled over HTTPS. Mutations require the same Origin, and login attempts have a separate rate limiter.

## Development and verification

```sh
npm test
npm run build
```

Tests exercise validation, assessment interpretation, the API contract, persistence, retries, rate limits, curation, and sharing. Build generates social images and runs a Wrangler deployment dry run; it does not publish. A live JEV check requires a real API key.

- `/ui-review`: numbered desktop/mobile fixtures using the real UI renderer without model calls.
- `/share-review`: previews of Home, Yes, and No social cards.
- `npm run share:build`: regenerates the static 1200 × 630 PNG cards, also run automatically by build/deploy. Bump `SHARE_IMAGE_VERSION` in `public/share-data.js` when changing their design.

An optional WebMCP tool, `prepare_management_story`, fills the visible form without submitting it when the browser supports the API.

## Project layout

- `public/`: interface, styles, review fixtures, legal templates, fonts, and social assets.
- `src/worker.js`: routing and assessment API.
- `src/assessment.js`, `src/response-v1.js`: JEV questions and versioned result interpretation.
- `src/storage.js`, `migrations/`: persistence and database schema.
- `src/curation.js`: administrator sessions and story curation.
- `scripts/`: social image generation.
- `tests/`: automated checks using local D1 through Miniflare.
- `wrangler.jsonc`: Worker, assets, database, and rate limiter configuration.

## References

- [JEV API](https://docs.typesafe.ai/api)
- [JEV scoring](https://docs.typesafe.ai/primitives/score)
- [Cloudflare static assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Bundled JetBrains Mono fonts retain their licence in `public/fonts/OFL.txt`.
