// 小さな DOM 生成ヘルパー。文字列はすべてテキストとして入る（html だけは自前の SVG 用）。
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...clean(children));
  return el;
}

// 配列はならし、null / false（条件つきの子）は取り除く。
const clean = (children) => children.flat().filter((child) => child != null && child !== false);

// 要素の中身を入れ替える。h() と同じく配列や条件つきの子を渡せる。
export function fill(el, ...children) {
  el.replaceChildren(...clean(children));
}

export const $ = (id) => document.getElementById(id);

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
