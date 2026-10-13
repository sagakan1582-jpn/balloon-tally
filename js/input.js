// スマホ入力画面。
import { ITEMS, COLORS } from './config.js';
import { colorById, colorsOf, itemById, jstParts, jstToday, normalizeColors, describe } from './core.js';
import { $, fill, h, registerServiceWorker } from './dom.js';
import { ICONS } from './icons.js';
import { DEMO, backend, queue, loadJson, saveJson, startAutoSync, storage } from './store.js';

const RECENT_KEY = 'balloon.recent';
const DEVICE_KEY = 'balloon.device';
const RECENT_KEEP = 30;
const RECENT_SHOW = 8;
const TOAST_MS = 6000;

let selectedItem = null;
let picked = [];
let recent = loadJson(RECENT_KEY, []);
let deviceName = storage.getItem(DEVICE_KEY) ?? '';
let toastTimer = null;

// 種類が未選択のあいだは 2 色まで先に選べる（色から先に聞いた場合のため）。
const capacity = () => (selectedItem ? itemById(selectedItem).colors : 2);

// crypto.randomUUID は https / localhost でしか使えないので、LAN 内の http でも動くようにしておく。
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const dot = (colorId) => h('span', { class: 'dot', style: `--c:${colorById(colorId)?.hex ?? '#ccc'}` });

function pickItem(id) {
  selectedItem = id;
  picked = picked.slice(0, capacity());
  render();
}

function pickColor(id) {
  if (capacity() === 1) picked = [id];
  else if (picked.length < 2) picked = [...picked, id];
  else return nudge();
  render();
}

function unpickColor(index) {
  picked = picked.filter((_, i) => i !== index);
  render();
}

function clearSelection() {
  selectedItem = null;
  picked = [];
  render();
}

// 2 色とも選択済みのときに別の色を押した場合の合図。
function nudge() {
  const summary = $('summary');
  summary.classList.remove('nudge');
  void summary.offsetWidth;
  summary.classList.add('nudge');
}

function render() {
  for (const button of $('items').children) {
    button.setAttribute('aria-pressed', String(button.dataset.id === selectedItem));
  }
  for (const button of $('colors').children) {
    const count = picked.filter((id) => id === button.dataset.id).length;
    button.setAttribute('aria-pressed', String(count > 0));
    button.querySelector('.badge').textContent = count === 2 ? '×2' : '';
  }

  const item = selectedItem && itemById(selectedItem);
  $('color-hint').textContent = item ? `${item.colors}色えらぶ` : '';

  const remaining = item ? item.colors - picked.length : 0;
  const summary = $('summary');
  if (!item && picked.length === 0) {
    fill(summary, h('span', { class: 'muted' }, '種類と色をえらんでください'));
  } else {
    fill(
      summary,
      h('span', { class: item ? 'summary-item' : 'muted' }, item ? item.label : '種類をえらぶ'),
      picked.map((id, index) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-label': `${colorById(id).label}を外す`,
            onclick: () => unpickColor(index),
          },
          dot(id),
          colorById(id).label,
          h('span', { class: 'chip-x' }, '×'),
        ),
      ),
      remaining > 0 && h('span', { class: 'muted' }, `あと${remaining}色`),
    );
  }

  $('submit-btn').disabled = !item || remaining !== 0;
}

function submit() {
  const item = selectedItem && itemById(selectedItem);
  if (!item || picked.length !== item.colors) return;
  const row = {
    id: newId(),
    item: item.id,
    ...normalizeColors(item.id, picked),
    recorded_at: new Date().toISOString(),
    device: deviceName || null,
    deleted_at: null,
  };
  queue.put(row);
  saveRecent([row, ...recent]);
  queue.sync();
  navigator.vibrate?.(30);

  clearSelection();
  renderRecent();
  showToast(`${describe(row)} を登録しました`, { label: '取り消す', run: () => setVoided(row.id, true) });
}

function saveRecent(rows) {
  recent = rows.slice(0, RECENT_KEEP);
  saveJson(RECENT_KEY, recent);
}

// 取り消し／元に戻す。行まるごとをキューに入れ直すので、未送信でも送信済みでも同じ処理になる。
function setVoided(id, voided) {
  const row = recent.find((r) => r.id === id);
  if (!row) return;
  const updated = { ...row, deleted_at: voided ? new Date().toISOString() : null };
  saveRecent(recent.map((r) => (r.id === id ? updated : r)));
  queue.put(updated);
  queue.sync();
  renderRecent();
  showToast(voided ? `${describe(row)} を取り消しました` : `${describe(row)} を元に戻しました`);
}

function showToast(message, action) {
  const toast = $('toast');
  fill(
    toast,
    h('span', {}, message),
    action &&
      h(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onclick: () => {
            hideToast();
            action.run();
          },
        },
        action.label,
      ),
  );
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}

function renderRecent() {
  const list = $('recent');
  list.replaceChildren(
    ...recent.slice(0, RECENT_SHOW).map((row) =>
      h(
        'li',
        { class: row.deleted_at ? 'voided' : '' },
        h('span', { class: 'recent-time' }, jstParts(row.recorded_at).time.slice(0, 5)),
        h(
          'span',
          { class: 'recent-what' },
          colorsOf(row).map(dot),
          h('span', { class: 'recent-label' }, describe(row)),
        ),
        h(
          'button',
          { class: 'btn btn-small', type: 'button', onclick: () => setVoided(row.id, !row.deleted_at) },
          row.deleted_at ? '元に戻す' : '取り消す',
        ),
      ),
    ),
  );
  if (!recent.length) list.append(h('li', { class: 'muted' }, 'まだありません'));
}

function renderSync() {
  const pill = $('sync-status');
  const pending = queue.size();
  pill.textContent = pending ? `未送信 ${pending} 件` : DEMO ? 'デモ' : '送信済み';
  pill.className = `pill ${pending ? 'pill-warn' : 'pill-ok'}`;

  // 通信エラーは「未送信」表示で足りる。code つき（サーバーが拒否した）場合だけ内容を出す。
  const error = queue.lastError();
  const dead = queue.dead().length;
  const messages = [];
  if (error?.code) messages.push(`サーバーエラーで送信できません：${error.message}`);
  if (dead) messages.push(`送信できなかった記録が ${dead} 件あります。設定（種類・色）を確認してください。`);
  $('alert').textContent = messages.join(' ／ ');
  $('alert').hidden = messages.length === 0;
}

async function refreshCount() {
  try {
    $('today-count').textContent = await backend.countDay(jstToday());
  } catch {
    // 圏外のあいだは前回の数字のままにする
  }
}

function renderDevice() {
  $('device-btn').textContent = deviceName ? `端末名：${deviceName}` : '端末名を設定';
}

function editDevice() {
  const name = prompt('この端末の呼び名（例：受付1）。空欄で未設定に戻します。', deviceName);
  if (name == null) return;
  deviceName = name.trim().slice(0, 40);
  storage.setItem(DEVICE_KEY, deviceName);
  renderDevice();
}

function init() {
  $('items').append(
    ...ITEMS.map((item) =>
      h(
        'button',
        { class: 'item-btn', type: 'button', 'data-id': item.id, 'aria-pressed': 'false', onclick: () => pickItem(item.id) },
        h('span', { class: 'item-icon', html: ICONS[item.id] }),
        h('span', { class: 'item-label' }, item.label),
        item.colors === 2 && h('span', { class: 'item-note' }, '2色'),
      ),
    ),
  );
  $('colors').append(
    ...COLORS.map((color) =>
      h(
        'button',
        { class: 'color-btn', type: 'button', 'data-id': color.id, 'aria-pressed': 'false', onclick: () => pickColor(color.id) },
        h('span', { class: 'swatch', style: `--c:${color.hex}` }, h('span', { class: 'badge' })),
        h('span', { class: 'color-label' }, color.label),
      ),
    ),
  );

  $('submit-btn').addEventListener('click', submit);
  $('clear-btn').addEventListener('click', clearSelection);
  $('device-btn').addEventListener('click', editDevice);
  $('demo-banner').hidden = !DEMO;

  let countTimer = null;
  queue.onChange(() => {
    renderSync();
    if (queue.size() > 0) return;
    clearTimeout(countTimer);
    countTimer = setTimeout(refreshCount, 200);
  });
  setInterval(refreshCount, 30000);

  render();
  renderRecent();
  renderSync();
  renderDevice();
  refreshCount();
  startAutoSync();
  registerServiceWorker();
}

init();
