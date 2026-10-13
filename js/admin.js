// PC 集計・管理画面。
import { ITEMS, COLORS } from './config.js';
import {
  OUT_SLOT,
  SLOTS,
  aggregate,
  colorById,
  colorsOf,
  itemById,
  jstParts,
  jstToday,
  shiftDate,
  slotLabel,
  toCsv,
} from './core.js';
import { $, h, registerServiceWorker } from './dom.js';
import { ICONS } from './icons.js';
import { DEMO, backend } from './store.js';

const POLL_MS = 30000;

let date = jstToday();
let allDays = false;
let records = [];
let loadError = null;
let updatedAt = null;
let requestSeq = 0;

const dot = (colorId) => h('span', { class: 'dot', style: `--c:${colorById(colorId)?.hex ?? '#ccc'}` });
const colorName = (colorId) => colorById(colorId)?.label ?? colorId;
const num = (value) => h('td', { class: value ? 'n' : 'n zero' }, String(value));

async function refresh() {
  const seq = ++requestSeq;
  try {
    const rows = await backend.fetchRecords(allDays ? null : date);
    if (seq !== requestSeq) return; // 日付を切り替えた後に届いた古い結果は捨てる
    records = rows;
    loadError = null;
    updatedAt = new Date();
  } catch (err) {
    if (seq !== requestSeq) return;
    loadError = err;
  }
  render();
}

function render() {
  const summary = aggregate(records);
  renderStatus();
  renderTiles(summary);
  renderHourChart(summary);
  renderHourTable(summary);
  renderColorTable(summary);
  renderComboTable(summary);
  renderRecordTable();
}

function renderStatus() {
  $('status').textContent = updatedAt ? `${jstParts(updatedAt).time} 更新` : '読み込み中…';
  $('alert').textContent = loadError ? `読み込みに失敗しました：${loadError.message}` : '';
  $('alert').hidden = !loadError;
  $('date').value = date;
  for (const id of ['date', 'prev-day', 'next-day', 'today-btn']) $(id).disabled = allDays;
}

function renderTiles(summary) {
  $('tiles').replaceChildren(
    h(
      'div',
      { class: 'tile tile-hero' },
      h('span', { class: 'tile-label' }, allDays ? '全期間の合計' : 'この日の合計'),
      h('span', { class: 'hero' }, String(summary.total)),
    ),
    ...ITEMS.map((item) =>
      h(
        'div',
        { class: 'tile' },
        h('span', { class: 'tile-icon', html: ICONS[item.id] }),
        h('span', { class: 'tile-label' }, item.label),
        h('span', { class: 'tile-value' }, String(summary.byItem[item.id])),
      ),
    ),
  );
}

// 目盛りが 4 本以下に収まる、きりのいい刻みを選ぶ。
function niceScale(max) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 4) ?? 2000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick);
  return { top, ticks };
}

function renderHourChart(summary) {
  const root = $('hour-chart');
  if (summary.total === 0) {
    root.replaceChildren(h('p', { class: 'empty' }, '記録はまだありません'));
    return;
  }
  // 「時間外」は記録があるときだけ柱を出す（表には常に行がある）。
  const slots = SLOTS.filter((slot) => slot !== OUT_SLOT || summary.bySlot[slot].total > 0);
  const peak = Math.max(...slots.map((slot) => summary.bySlot[slot].total));
  const { top, ticks } = niceScale(peak);
  const pct = (value) => `${(value / top) * 100}%`;

  root.replaceChildren(
    h(
      'div',
      { class: 'chart' },
      h(
        'div',
        { class: 'chart-y', 'aria-hidden': 'true' },
        ticks.map((tick) => h('span', { style: `bottom:${pct(tick)}` }, String(tick))),
      ),
      h(
        'div',
        { class: 'chart-plot' },
        ticks.map((tick) =>
          h('span', { class: tick === 0 ? 'grid grid-base' : 'grid', style: `bottom:${pct(tick)}` }),
        ),
        h(
          'div',
          { class: 'chart-cols' },
          slots.map((slot) => {
            const data = summary.bySlot[slot];
            const col = h(
              'div',
              { class: 'col', tabindex: '0', 'aria-label': `${slotLabel(slot)} ${data.total} 個` },
              h(
                'div',
                { class: 'bar', style: `height:${pct(data.total)}` },
                // 値ラベルは最多の時間帯だけ。残りは表とツールチップで読める。
                data.total === peak && h('span', { class: 'bar-label' }, String(data.total)),
              ),
            );
            const show = () => showTooltip(col, slot, data);
            col.addEventListener('mouseenter', show);
            col.addEventListener('focus', show);
            col.addEventListener('mouseleave', hideTooltip);
            col.addEventListener('blur', hideTooltip);
            return col;
          }),
        ),
      ),
      h('div', { class: 'chart-x', 'aria-hidden': 'true' }, slots.map((slot) => h('span', {}, slotLabel(slot)))),
    ),
  );
}

function showTooltip(col, slot, data) {
  const tooltip = $('tooltip');
  tooltip.replaceChildren(
    h('div', { class: 'tooltip-title' }, `${slotLabel(slot)}　${data.total} 個`),
    ...ITEMS.filter((item) => data[item.id] > 0).map((item) =>
      h('div', { class: 'tooltip-row' }, h('span', {}, item.label), h('span', {}, String(data[item.id]))),
    ),
  );
  tooltip.hidden = false;
  const rect = col.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 6}px`;
}

function hideTooltip() {
  $('tooltip').hidden = true;
}

function renderHourTable(summary) {
  $('hour-table').replaceChildren(
    h(
      'thead',
      {},
      h('tr', {}, h('th', {}, '時間帯'), ITEMS.map((item) => h('th', { class: 'n' }, item.label)), h('th', { class: 'n' }, '合計')),
    ),
    h(
      'tbody',
      {},
      SLOTS.map((slot) =>
        h(
          'tr',
          {},
          h('th', {}, slotLabel(slot)),
          ITEMS.map((item) => num(summary.bySlot[slot][item.id])),
          num(summary.bySlot[slot].total),
        ),
      ),
    ),
    h(
      'tfoot',
      {},
      h('tr', {}, h('th', {}, '合計'), ITEMS.map((item) => num(summary.byItem[item.id])), num(summary.total)),
    ),
  );
}

function renderColorTable(summary) {
  $('color-table').replaceChildren(
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, '種類'),
        COLORS.map((color) => h('th', { class: 'n' }, dot(color.id), ' ', color.label)),
      ),
    ),
    h(
      'tbody',
      {},
      ITEMS.map((item) =>
        h('tr', {}, h('th', {}, item.label), COLORS.map((color) => num(summary.colorUse[item.id][color.id]))),
      ),
    ),
    h('tfoot', {}, h('tr', {}, h('th', {}, '合計'), COLORS.map((color) => num(summary.colorTotal[color.id])))),
  );
}

function renderComboTable(summary) {
  const table = $('combo-table');
  if (!summary.combos.length) {
    table.replaceChildren(h('tbody', {}, h('tr', {}, h('td', { class: 'empty' }, '記録はまだありません'))));
    return;
  }
  table.replaceChildren(
    h('thead', {}, h('tr', {}, h('th', {}, '種類'), h('th', {}, '組み合わせ'), h('th', { class: 'n' }, '個数'))),
    h(
      'tbody',
      {},
      summary.combos.map((combo) =>
        h(
          'tr',
          {},
          h('td', {}, itemById(combo.item).label),
          h('td', {}, dot(combo.color1), ' ', colorName(combo.color1), ' ＋ ', dot(combo.color2), ' ', colorName(combo.color2)),
          num(combo.count),
        ),
      ),
    ),
  );
}

function renderRecordTable() {
  const showDeleted = $('show-deleted').checked;
  const rows = records.filter((record) => showDeleted || !record.deleted_at).reverse();
  const table = $('record-table');
  if (!rows.length) {
    table.replaceChildren(h('tbody', {}, h('tr', {}, h('td', { class: 'empty' }, '記録はまだありません'))));
    return;
  }
  table.replaceChildren(
    h(
      'thead',
      {},
      h('tr', {}, h('th', {}, '時刻'), h('th', {}, '種類'), h('th', {}, '色'), h('th', {}, '端末'), h('th', {}, '')),
    ),
    h(
      'tbody',
      {},
      rows.map((record) => {
        const { date: day, time } = jstParts(record.recorded_at);
        return h(
          'tr',
          { class: record.deleted_at ? 'voided' : '' },
          h('td', { class: 'time' }, allDays ? `${day} ${time}` : time),
          h('td', {}, itemById(record.item)?.label ?? record.item),
          h(
            'td',
            {},
            colorsOf(record).flatMap((id, index) => [index ? ' ＋ ' : '', dot(id), ' ', colorName(id)]),
          ),
          h('td', {}, record.device ?? ''),
          h(
            'td',
            { class: 'actions' },
            record.deleted_at && h('span', { class: 'muted' }, '取り消し済み '),
            h(
              'button',
              { class: 'btn btn-small', type: 'button', onclick: () => setDeleted(record, !record.deleted_at) },
              record.deleted_at ? '元に戻す' : '取り消す',
            ),
          ),
        );
      }),
    ),
  );
}

async function setDeleted(record, deleted) {
  try {
    await backend.setDeleted(record.id, deleted ? new Date().toISOString() : null);
  } catch (err) {
    alert(`更新できませんでした：${err.message}`);
  }
  refresh();
}

function downloadCsv() {
  const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `balloon-${allDays ? 'all' : date}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function setDate(next) {
  if (!next) return;
  date = next;
  refresh();
}

function init() {
  $('demo-banner').hidden = !DEMO;
  $('date').addEventListener('change', (event) => setDate(event.target.value));
  $('prev-day').addEventListener('click', () => setDate(shiftDate(date, -1)));
  $('next-day').addEventListener('click', () => setDate(shiftDate(date, 1)));
  $('today-btn').addEventListener('click', () => setDate(jstToday()));
  $('all-days').addEventListener('change', (event) => {
    allDays = event.target.checked;
    refresh();
  });
  $('reload-btn').addEventListener('click', refresh);
  $('csv-btn').addEventListener('click', downloadCsv);
  $('show-deleted').addEventListener('change', renderRecordTable);

  // 変更通知が続けて届いても、取り直しは 1 回にまとめる。
  let timer = null;
  backend.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
  });
  setInterval(refresh, POLL_MS);

  render();
  refresh();
  registerServiceWorker();
}

init();
