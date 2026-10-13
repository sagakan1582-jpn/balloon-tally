import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOTS,
  aggregate,
  describe,
  jstDayRange,
  jstParts,
  normalizeColors,
  shiftDate,
  slotOf,
  toCsv,
} from '../js/core.js';

const rec = (item, color1, color2, recorded_at, extra = {}) => ({
  id: `${item}-${recorded_at}`,
  item,
  color1,
  color2,
  recorded_at,
  device: null,
  deleted_at: null,
  ...extra,
});

test('jstParts は端末のタイムゾーンに関係なく日本時間を返す', () => {
  assert.deepEqual(jstParts('2026-11-01T01:05:09Z'), {
    date: '2026-11-01',
    time: '10:05:09',
    hour: 10,
  });
  // UTC では前日でも日本時間では翌日
  assert.equal(jstParts('2026-10-31T15:00:00Z').date, '2026-11-01');
});

test('jstDayRange は日本時間の 0 時から 24 時間', () => {
  assert.deepEqual(jstDayRange('2026-11-01'), [
    '2026-10-31T15:00:00.000Z',
    '2026-11-01T15:00:00.000Z',
  ]);
});

test('shiftDate は月をまたいで前後の日付を返す', () => {
  assert.equal(shiftDate('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDate('2026-10-31', 1), '2026-11-01');
});

test('slotOf は 10 時台〜17 時台と時間外に分ける', () => {
  assert.deepEqual(SLOTS, ['10', '11', '12', '13', '14', '15', '16', '17', 'out']);
  assert.equal(slotOf('2026-11-01T09:59:59+09:00'), 'out');
  assert.equal(slotOf('2026-11-01T10:00:00+09:00'), '10');
  assert.equal(slotOf('2026-11-01T17:59:59+09:00'), '17');
  assert.equal(slotOf('2026-11-01T18:00:00+09:00'), 'out');
});

test('normalizeColors: 1色の種類は color2 が null', () => {
  assert.deepEqual(normalizeColors('dog', ['blue']), { color1: 'blue', color2: null });
});

test('normalizeColors: 2色は選んだ順に関係なく同じ組み合わせになる', () => {
  const expected = { color1: 'pink', color2: 'blue' };
  assert.deepEqual(normalizeColors('flower', ['pink', 'blue']), expected);
  assert.deepEqual(normalizeColors('flower', ['blue', 'pink']), expected);
});

test('normalizeColors: 同じ色を 2 回えらべる', () => {
  assert.deepEqual(normalizeColors('heart', ['red', 'red']), { color1: 'red', color2: 'red' });
});

test('normalizeColors: 色の数が合わない・未知の値はエラー', () => {
  assert.throws(() => normalizeColors('dog', ['pink', 'blue']));
  assert.throws(() => normalizeColors('flower', ['pink']));
  assert.throws(() => normalizeColors('dog', ['gold']));
  assert.throws(() => normalizeColors('cat', ['pink']));
});

test('describe は種類と色を日本語で返す', () => {
  assert.equal(describe(rec('dog', 'blue', null, '2026-11-01T01:00:00Z')), '犬（ブルー）');
  assert.equal(
    describe(rec('flower', 'pink', 'blue', '2026-11-01T01:00:00Z')),
    'はな（ピンク＋ブルー）',
  );
});

test('aggregate は種類・時間帯・色・組み合わせを数え、取り消しは除く', () => {
  const result = aggregate([
    rec('dog', 'blue', null, '2026-11-01T10:10:00+09:00'),
    rec('dog', 'pink', null, '2026-11-01T10:50:00+09:00'),
    rec('flower', 'pink', 'blue', '2026-11-01T13:00:00+09:00'),
    rec('flower', 'pink', 'blue', '2026-11-01T13:30:00+09:00'),
    rec('heart', 'red', 'red', '2026-11-01T18:20:00+09:00'),
    rec('bear', 'green', null, '2026-11-01T11:00:00+09:00', {
      deleted_at: '2026-11-01T02:01:00Z',
    }),
  ]);

  assert.equal(result.total, 5);
  assert.equal(result.byItem.dog, 2);
  assert.equal(result.byItem.flower, 2);
  assert.equal(result.byItem.bear, 0);

  assert.equal(result.bySlot['10'].total, 2);
  assert.equal(result.bySlot['10'].dog, 2);
  assert.equal(result.bySlot['11'].total, 0);
  assert.equal(result.bySlot['13'].flower, 2);
  assert.equal(result.bySlot.out.heart, 1);

  // 2色の種類は使った色それぞれを数える（同色 2 回は 2）
  assert.equal(result.colorUse.flower.pink, 2);
  assert.equal(result.colorUse.flower.blue, 2);
  assert.equal(result.colorUse.heart.red, 2);
  assert.equal(result.colorTotal.pink, 3);
  assert.equal(result.colorTotal.blue, 3);
  assert.equal(result.colorTotal.green, 0);

  assert.deepEqual(result.combos, [
    { item: 'flower', color1: 'pink', color2: 'blue', count: 2 },
    { item: 'heart', color1: 'red', color2: 'red', count: 1 },
  ]);
});

test('toCsv は BOM つきで、取り消しも状態つきで出す', () => {
  const csv = toCsv([
    rec('flower', 'pink', 'blue', '2026-11-01T13:05:00+09:00', { id: 'a1', device: '受付, 1' }),
    rec('dog', 'red', null, '2026-11-01T19:00:00+09:00', {
      id: 'b2',
      deleted_at: '2026-11-01T10:01:00Z',
    }),
  ]);
  assert.ok(csv.startsWith('﻿日付,時刻,時間帯,種類,色1,色2,端末,状態,ID\r\n'));
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[1], '2026-11-01,13:05:00,13時台,はな,ピンク,ブルー,"受付, 1",有効,a1');
  assert.equal(lines[2], '2026-11-01,19:00:00,時間外,犬,赤,,,取り消し,b2');
});
