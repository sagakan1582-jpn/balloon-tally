// 画面にもサーバーにも依存しない計算だけを置く（node --test でテストする）。
import { ITEMS, COLORS, OPEN_HOUR, CLOSE_HOUR } from './config.js';

// 日本時間は夏時間がないので固定の +9 時間で計算する（端末のタイムゾーン設定に左右されない）。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const OUT_SLOT = 'out';
export const SLOTS = [
  ...Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => String(OPEN_HOUR + i)),
  OUT_SLOT,
];

export const itemById = (id) => ITEMS.find((item) => item.id === id);
export const colorById = (id) => COLORS.find((color) => color.id === id);

const pad2 = (n) => String(n).padStart(2, '0');

export function jstParts(when) {
  const d = new Date(new Date(when).getTime() + JST_OFFSET_MS);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`,
    hour: d.getUTCHours(),
  };
}

export const jstToday = (now = new Date()) => jstParts(now).date;

// 'YYYY-MM-DD'（日本時間）の 1 日を [開始, 終了) の ISO 文字列で返す。
export function jstDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  return [start.toISOString(), new Date(start.getTime() + DAY_MS).toISOString()];
}

export function shiftDate(dateStr, days) {
  return jstParts(new Date(`${dateStr}T12:00:00+09:00`).getTime() + days * DAY_MS).date;
}

export function slotOf(when) {
  const { hour } = jstParts(when);
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR ? String(hour) : OUT_SLOT;
}

export const slotLabel = (slot) => (slot === OUT_SLOT ? '時間外' : `${slot}時台`);

// 選ばれた色を保存用の color1 / color2 にする。2色は COLORS の並び順に揃えるので、
// 「ピンク＋ブルー」と「ブルー＋ピンク」は同じ組み合わせとして記録される。
export function normalizeColors(itemId, picked) {
  const item = itemById(itemId);
  if (!item) throw new Error(`unknown item: ${itemId}`);
  if (picked.length !== item.colors) {
    throw new Error(`${item.label} は ${item.colors} 色えらぶ必要があります`);
  }
  const order = picked.map((id) => {
    const index = COLORS.findIndex((color) => color.id === id);
    if (index < 0) throw new Error(`unknown color: ${id}`);
    return index;
  });
  order.sort((a, b) => a - b);
  return {
    color1: COLORS[order[0]].id,
    color2: item.colors === 2 ? COLORS[order[1]].id : null,
  };
}

export const colorsOf = (record) =>
  record.color2 ? [record.color1, record.color2] : [record.color1];

export function describe(record) {
  const item = itemById(record.item)?.label ?? record.item;
  const colors = colorsOf(record).map((id) => colorById(id)?.label ?? id);
  return `${item}（${colors.join('＋')}）`;
}

const countsBy = (list) => Object.fromEntries(list.map(({ id }) => [id, 0]));

// 取り消し済み（deleted_at あり）は数えない。
export function aggregate(records) {
  const result = {
    total: 0,
    byItem: countsBy(ITEMS),
    bySlot: Object.fromEntries(SLOTS.map((slot) => [slot, { total: 0, ...countsBy(ITEMS) }])),
    colorUse: Object.fromEntries(ITEMS.map(({ id }) => [id, countsBy(COLORS)])),
    colorTotal: countsBy(COLORS),
    combos: [],
  };
  const combos = new Map();

  for (const record of records) {
    if (record.deleted_at || !(record.item in result.byItem)) continue;
    const slot = result.bySlot[slotOf(record.recorded_at)];
    result.total += 1;
    result.byItem[record.item] += 1;
    slot.total += 1;
    slot[record.item] += 1;
    for (const color of colorsOf(record)) {
      if (!(color in result.colorTotal)) continue;
      result.colorUse[record.item][color] += 1;
      result.colorTotal[color] += 1;
    }
    if (record.color2) {
      const key = `${record.item}|${record.color1}|${record.color2}`;
      const combo = combos.get(key) ?? {
        item: record.item,
        color1: record.color1,
        color2: record.color2,
        count: 0,
      };
      combo.count += 1;
      combos.set(key, combo);
    }
  }

  result.combos = [...combos.values()].sort((a, b) => b.count - a.count);
  return result;
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Excel でそのまま開けるように BOM つき・CRLF で出す。取り消し済みも「状態」列つきで含める。
export function toCsv(records) {
  const rows = [['日付', '時刻', '時間帯', '種類', '色1', '色2', '端末', '状態', 'ID']];
  for (const record of records) {
    const { date, time } = jstParts(record.recorded_at);
    rows.push([
      date,
      time,
      slotLabel(slotOf(record.recorded_at)),
      itemById(record.item)?.label ?? record.item,
      colorById(record.color1)?.label ?? record.color1,
      record.color2 ? colorById(record.color2)?.label ?? record.color2 : '',
      record.device ?? '',
      record.deleted_at ? '取り消し' : '有効',
      record.id,
    ]);
  }
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
