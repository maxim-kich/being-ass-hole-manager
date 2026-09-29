import { Resvg } from '@cf-wasm/resvg';
import { escapeHtml } from '../public/share-data.js';
export function shareSvg(data) {
  const result = data?.state === 'result';
  const color = result && data.verdict === 'yes' ? '#C15F5F' : '#42C07E';
  const text = (x, y, size, value, fill = '#CFDACD') => `<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="${size}" fill="${fill}">${escapeHtml(value)}</text>`;
  const logoRows = ["██████╗   █████╗  ██╗  ██╗ ███╗   ███╗ ", "██╔══██╗ ██╔══██╗ ██║  ██║ ████╗ ████║ ", "██████╔╝ ███████║ ███████║ ██╔████╔██║ ", "██╔══██╗ ██╔══██║ ██╔══██║ ██║╚██╔╝██║ ", "██████╔╝ ██║  ██║ ██║  ██║ ██║ ╚═╝ ██║ ", "╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝     ╚═╝ "];
  const logo = logoRows.map((row, i) => text(64, 52 + i * 8, 8, row, '#42C07E').replace('<text ', '<text xml:space="preserve" ')).join('');
  let content = logo + text(1136, 80, 24, 'Powered by JEV', '#777D77').replace('x="1136"', 'x="1136" text-anchor="end"');
  const headline = (y, value, fill) => text(64, y, 115, value, fill).replace('<text ', '<text letter-spacing="-0.065em" font-weight="600" ');
  if (result) {
    const lines = data.verdict === 'yes' ? ['Yes. That’s an', 'a-hole manager.'] : ['An a-hole manager', 'was not detected.'];
    lines.forEach((line, i) => { content += headline(568 - (lines.length - 1 - i) * 126, line, color); });
  } else {
    content += headline(363, 'Is my manager', '#CFDACD') + headline(489, 'being an a-hole?', color);
    content += text(64, 568, 27, 'Describe the situation and get honest assessment.');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#111211"/><rect x="64" y="114" width="1072" height="1" fill="#363936"/>${content}</svg>`;
}
export async function sharePng(data, font, semibold) {
  const renderer = await Resvg.async(shareSvg(data), { font: { fontBuffers: [new Uint8Array(font), ...(semibold ? [new Uint8Array(semibold)] : [])], loadSystemFonts: false } });
  try { const rendered = renderer.render(); try { return rendered.asPng(); } finally { rendered.free(); } } finally { renderer.free(); }
}
