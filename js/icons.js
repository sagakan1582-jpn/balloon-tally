// 種類のアイコン（自作の簡易イラスト）。キーは config.js の ITEMS の id。
const svg = (body) =>
  `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const INK = '#2b2b2b';

export const ICONS = {
  dog: svg(`
    <ellipse cx="13" cy="29" rx="8" ry="15" fill="#8a5a3c" transform="rotate(14 13 29)"/>
    <ellipse cx="51" cy="29" rx="8" ry="15" fill="#8a5a3c" transform="rotate(-14 51 29)"/>
    <circle cx="32" cy="34" r="20" fill="#e0ac72"/>
    <ellipse cx="32" cy="43" rx="10" ry="8" fill="#f8e8d0"/>
    <circle cx="24" cy="31" r="2.6" fill="${INK}"/>
    <circle cx="40" cy="31" r="2.6" fill="${INK}"/>
    <ellipse cx="32" cy="39" rx="3.6" ry="2.6" fill="${INK}"/>
    <path d="M32 41.5v3m0 0q-3 3-6 1m6-1q3 3 6 1" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`),
  bear: svg(`
    <circle cx="15" cy="18" r="9" fill="#8a5a3c"/>
    <circle cx="49" cy="18" r="9" fill="#8a5a3c"/>
    <circle cx="15" cy="18" r="4.5" fill="#d9a983"/>
    <circle cx="49" cy="18" r="4.5" fill="#d9a983"/>
    <circle cx="32" cy="36" r="22" fill="#a9714b"/>
    <ellipse cx="32" cy="43" rx="10" ry="8" fill="#f3dfc4"/>
    <circle cx="23" cy="32" r="2.6" fill="${INK}"/>
    <circle cx="41" cy="32" r="2.6" fill="${INK}"/>
    <ellipse cx="32" cy="40" rx="3.6" ry="2.6" fill="${INK}"/>
    <path d="M32 42.5v2.5m0 0q-2.5 2.5-5 1m5-1q2.5 2.5 5 1" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`),
  sword: svg(`
    <g transform="rotate(45 32 32)">
      <path d="M28.5 7 32 1l3.5 6v33h-7z" fill="#b9c6d3"/>
      <path d="M32 1l3.5 6v33H32z" fill="#93a4b5"/>
      <rect x="19" y="40" width="26" height="5.5" rx="2.5" fill="#e3a916"/>
      <rect x="29.2" y="45.5" width="5.6" height="12" rx="1.5" fill="#8a5a3c"/>
      <circle cx="32" cy="59.5" r="3.4" fill="#e3a916"/>
    </g>`),
  flower: svg(`
    <g fill="#f58ab4">
      <circle cx="32" cy="17" r="10"/>
      <circle cx="46.3" cy="27.4" r="10"/>
      <circle cx="40.8" cy="44.1" r="10"/>
      <circle cx="23.2" cy="44.1" r="10"/>
      <circle cx="17.7" cy="27.4" r="10"/>
    </g>
    <circle cx="32" cy="32" r="8" fill="#ffd61f"/>`),
  heart: svg(`
    <path d="M32 56C9 39 5 24 13.5 15.5C21 8 30 12 32 20c2-8 11-12 18.5-4.5C59 24 55 39 32 56z" fill="#e6394f"/>`),
  anpanman: svg(`
    <circle cx="32" cy="32" r="25" fill="#f7c794"/>
    <circle cx="16.5" cy="36" r="7" fill="#e8553d"/>
    <circle cx="47.5" cy="36" r="7" fill="#e8553d"/>
    <circle cx="32" cy="36" r="7.5" fill="#e8553d"/>
    <ellipse cx="24" cy="24" rx="2.2" ry="3.8" fill="${INK}"/>
    <ellipse cx="40" cy="24" rx="2.2" ry="3.8" fill="${INK}"/>
    <path d="M19 17q5-4 9-1M36 16q4-3 9 1" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M22 47q10 7 20 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`),
};
