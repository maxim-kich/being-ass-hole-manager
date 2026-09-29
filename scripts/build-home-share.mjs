import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { sharePng } from '../src/share.js';
const [regular, semibold] = await Promise.all(['Regular', 'SemiBold'].map(weight => readFile(new URL(`../public/fonts/JetBrainsMono-${weight}.ttf`, import.meta.url))));
await mkdir(new URL('../public/share/', import.meta.url), { recursive: true });
for (const variant of ['home', 'yes', 'no']) {
  const data = variant === 'home' ? undefined : { state: 'result', verdict: variant };
  const png = await sharePng(data, regular, semibold);
  await writeFile(new URL(`../public/share/${variant}.png`, import.meta.url), png);
  await writeFile(new URL(`../public/share-examples/${variant}.png`, import.meta.url), png);
  console.log(`${variant} static share image generated: ${png.length} bytes`);
}
