import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../js/queue.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
  };
}

const row = (id, extra = {}) => ({ id, item: 'dog', color1: 'pink', color2: null, ...extra });
const networkError = () => new Error('Failed to fetch');
const dataError = () => Object.assign(new Error('check constraint'), { code: '23514' });

test('送信に成功した行はキューから消える', async () => {
  const sent = [];
  const queue = createQueue({ storage: fakeStorage(), send: async (rows) => sent.push(rows) });
  queue.put(row('a'));
  queue.put(row('b'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual(sent, [[row('a'), row('b')]]);
});

test('通信エラーのときは残り、次の sync で送られる', async () => {
  let online = false;
  const sent = [];
  const queue = createQueue({
    storage: fakeStorage(),
    send: async (rows) => {
      if (!online) throw networkError();
      sent.push(...rows);
    },
  });
  queue.put(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 1);
  assert.ok(queue.lastError());

  online = true;
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.equal(queue.lastError(), null);
  assert.deepEqual(sent, [row('a')]);
});

test('キューは保存され、ページを開き直しても残る', async () => {
  const storage = fakeStorage();
  const offline = createQueue({
    storage,
    send: async () => {
      throw networkError();
    },
  });
  offline.put(row('a'));
  await offline.sync();

  const sent = [];
  const reopened = createQueue({ storage, send: async (rows) => sent.push(...rows) });
  assert.equal(reopened.size(), 1);
  await reopened.sync();
  assert.deepEqual(sent, [row('a')]);
});

test('同じ id は最新の内容 1 件にまとまる（未送信のまま取り消した場合）', async () => {
  const sent = [];
  const queue = createQueue({ storage: fakeStorage(), send: async (rows) => sent.push(...rows) });
  queue.put(row('a'));
  queue.put(row('a', { deleted_at: '2026-11-01T01:00:00Z' }));
  assert.equal(queue.size(), 1);
  await queue.sync();
  assert.deepEqual(sent, [row('a', { deleted_at: '2026-11-01T01:00:00Z' })]);
});

test('送信中に更新された行は消えず、続けて送られる', async () => {
  const sent = [];
  let queue;
  let first = true;
  queue = createQueue({
    storage: fakeStorage(),
    send: async (rows) => {
      if (first) {
        first = false;
        queue.put(row('a', { deleted_at: '2026-11-01T01:00:00Z' }));
      }
      sent.push(...rows);
    },
  });
  queue.put(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual(sent, [row('a'), row('a', { deleted_at: '2026-11-01T01:00:00Z' })]);
});

test('不正な行だけが「送信できない記録」に移り、残りは送られる', async () => {
  const sent = [];
  const queue = createQueue({
    storage: fakeStorage(),
    send: async (rows) => {
      if (rows.some((r) => r.id === 'bad')) throw dataError();
      sent.push(...rows);
    },
  });
  queue.put(row('a'));
  queue.put(row('bad'));
  queue.put(row('c'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual(sent, [row('a'), row('c')]);
  assert.deepEqual(
    queue.dead().map((entry) => entry.row.id),
    ['bad'],
  );
});

test('設定ミスなど行のせいではないエラーでは、記録を捨てない', async () => {
  const queue = createQueue({
    storage: fakeStorage(),
    send: async () => {
      throw Object.assign(new Error('permission denied'), { code: '42501' });
    },
  });
  queue.put(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 1);
  assert.equal(queue.dead().length, 0);
  assert.equal(queue.lastError().message, 'permission denied');
});

test('保存できない環境でもメモリ上で動く', async () => {
  const sent = [];
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const queue = createQueue({ storage: broken, send: async (rows) => sent.push(...rows) });
  queue.put(row('a'));
  await queue.sync();
  assert.deepEqual(sent, [row('a')]);
});
