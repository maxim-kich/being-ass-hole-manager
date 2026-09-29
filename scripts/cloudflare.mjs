import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
const commands = {
  build: ['deploy', '--dry-run', '--outdir', '.build'],
  deploy: ['deploy'],
  migrate: ['d1', 'migrations', 'apply', 'bahm-assessments', '--remote']
};
if (!commands[mode]) throw new Error('Expected build, deploy, or migrate.');
const id = process.env.D1_DATABASE_ID?.trim();
const placeholder = '00000000-0000-0000-0000-000000000000';
if ((mode !== 'build' && !id) || (id && (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || id === placeholder))) {
  console.error('Set D1_DATABASE_ID to your D1 database UUID in Cloudflare Settings → Builds → Variables and secrets.');
  process.exit(1);
}
// Keep paths relative to the project root and never alter the tracked config.
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
config.d1_databases.find(binding => binding.binding === 'DB').database_id = id || placeholder;
const generated = new URL(`../.wrangler-build-${process.pid}.json`, import.meta.url);
try {
  writeFileSync(generated, JSON.stringify(config, null, 2), { mode: 0o600 });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...commands[mode], '--config', fileURLToPath(generated)], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(generated);
}
