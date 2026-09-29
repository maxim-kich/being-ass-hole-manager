
import { states } from './ui-states.js';
const main = document.querySelector('main');
const template = await (await fetch('/')).text();
for (const [index, [id, title, description]] of states.entries()) {
 const number = String(index + 1).padStart(2, '0');
 const link = document.createElement('a'); link.href = `#${id}`; link.textContent = `${number} ${title}`; document.querySelector('nav').append(link);
 const card = document.createElement('article'); card.className = 'review-card'; card.id = id;
 const heading = document.createElement('h2'); heading.textContent = `${number} / ${title}`;
 const copy = document.createElement('p'); copy.textContent = description + ' ';
 const standalone = document.createElement('a'); standalone.href = `/?ui-state=${id}`; standalone.target = '_blank'; standalone.textContent = 'Open full size ↗'; copy.append(standalone);
 const canvas = document.createElement('div'); canvas.className = 'canvas';
 const frame = document.createElement('iframe'); frame.title = `${number}: ${title}`; frame.srcdoc = template.replace('<html lang="en">', `<html lang="en" data-ui-state="${id}">`); frame.height = '900';
 frame.addEventListener('load', () => {
   const doc = frame.contentDocument;
   const resize = () => { frame.style.height = '0px'; frame.style.height = `${Math.max(850, doc.body.scrollHeight)}px`; };
   new ResizeObserver(resize).observe(doc.body);
   doc.fonts.ready.then(resize); resize();
 });
 canvas.append(frame); card.append(heading, copy, canvas); main.append(card);
}
document.getElementById('count').textContent = `${states.length} states · no API calls`;
document.querySelectorAll('[data-width]').forEach(button => button.addEventListener('click', () => {
 document.body.classList.toggle('mobile', button.dataset.width === 'mobile');
 document.querySelectorAll('[data-width]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));

