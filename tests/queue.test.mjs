import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../js/queue.js';
import { createSafeStorage } from '../js/storage.js';

function rawStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
  };
}

// 本物のサーバーと同じく、insert は同じ id があれば何もしない、setDeleted は取り消し印だけを変える。
function fakeServer() {
  const rows = new Map();
  const calls = [];
  let fail = null; // (kind, payload) => Error | null
  return {
    rows,
    calls,
    failWith(fn) {
      fail = fn;
    },
    async insert(list) {
      const err = fail?.('insert', list);
      if (err) throw err;
      calls.push(['insert', list.map((r) => r.id)]);
      for (const row of list) if (!rows.has(row.id)) rows.set(row.id, { ...row });
    },
    async setDeleted(id, deletedAt) {
      const err = fail?.('void', id);
      if (err) throw err;
      calls.push(['void', id, deletedAt]);
      if (rows.has(id)) rows.get(id).deleted_at = deletedAt;
    },
  };
}

const queueOn = (raw, server) =>
  createQueue({ storage: createSafeStorage(() => raw), insert: server.insert, setDeleted: server.setDeleted });

const row = (id, extra = {}) => ({ id, item: 'dog', color1: 'pink', color2: null, deleted_at: null, ...extra });
const networkError = () => new Error('Failed to fetch');
const dataError = () => Object.assign(new Error('check constraint'), { code: '23514' });

test('送信に成功した記録はキューから消える', async () => {
  const server = fakeServer();
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  queue.add(row('b'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual(server.calls, [['insert', ['a', 'b']]]);
});

test('通信エラーのときは残り、次の sync で送られる', async () => {
  const server = fakeServer();
  server.failWith(() => networkError());
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 1);
  assert.ok(queue.lastError());

  server.failWith(null);
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.equal(queue.lastError(), null);
  assert.ok(server.rows.has('a'));
});

test('キューは保存され、ページを開き直しても残る', async () => {
  const raw = rawStorage();
  const server = fakeServer();
  server.failWith(() => networkError());
  const offline = queueOn(raw, server);
  offline.add(row('a'));
  await offline.sync();

  server.failWith(null);
  const reopened = queueOn(raw, server);
  assert.equal(reopened.size(), 1);
  await reopened.sync();
  assert.ok(server.rows.has('a'));
});

test('同じ端末で画面を 2 つ開いていても、互いの未送信分を消さない', async () => {
  const raw = rawStorage();
  const server = fakeServer();
  const tabA = queueOn(raw, server); // 受付で使っている画面（圏外）
  const tabB = queueOn(raw, server); // 放置されている画面
  server.failWith(() => networkError());
  tabA.add(row('a'));
  tabA.add(row('b'));
  await tabA.sync();
  await tabB.sync(); // 以前はここで空のキューを書き戻し、a・b が消えていた
  await tabB.sync();
  assert.equal(queueOn(raw, server).size(), 2);

  // 受付の画面が閉じられても、開き直せば送られる
  server.failWith(null);
  await queueOn(raw, server).sync();
  assert.deepEqual([...server.rows.keys()], ['a', 'b']);
});

test('2 つの画面で同時に登録しても、両方の記録が残る', async () => {
  const raw = rawStorage();
  const server = fakeServer();
  server.failWith(() => networkError());
  const tabA = queueOn(raw, server);
  const tabB = queueOn(raw, server);
  tabA.add(row('a'));
  tabB.add(row('b'));
  tabA.add(row('c'));
  assert.equal(tabB.size(), 3);
  server.failWith(null);
  await tabB.sync();
  assert.deepEqual([...server.rows.keys()].sort(), ['a', 'b', 'c']);
});

test('送信済みの記録の取り消しは、取り消し印だけを送る', async () => {
  const server = fakeServer();
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  await queue.sync();
  queue.setDeleted('a', '2026-11-01T01:00:00Z');
  assert.equal(queue.size(), 1);
  await queue.sync();
  assert.deepEqual(server.calls.at(-1), ['void', 'a', '2026-11-01T01:00:00Z']);
  assert.equal(server.rows.get('a').deleted_at, '2026-11-01T01:00:00Z');
  assert.equal(queue.size(), 0);
});

test('未送信のまま取り消した記録は、登録してから取り消しが届く', async () => {
  const server = fakeServer();
  server.failWith(() => networkError());
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  queue.setDeleted('a', '2026-11-01T01:00:00Z');
  assert.equal(queue.size(), 1, '同じ記録は 1 件と数える');
  server.failWith(null);
  await queue.sync();
  assert.deepEqual(
    server.calls.map((c) => c[0]),
    ['insert', 'void'],
  );
  assert.equal(server.rows.get('a').deleted_at, '2026-11-01T01:00:00Z');
});

test('再送が PC 側の取り消しを打ち消さない', async () => {
  const server = fakeServer();
  // 1 回目の送信はサーバーに届いたが、返事が途中で切れた
  let lostOnce = true;
  server.failWith((kind) => {
    if (kind === 'insert' && lostOnce) {
      lostOnce = false;
      server.rows.set('a', row('a'));
      return networkError();
    }
    return null;
  });
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 1);

  server.rows.get('a').deleted_at = '2026-11-01T02:00:00Z'; // そのあいだに PC で取り消し
  await queue.sync(); // 再送
  assert.equal(server.rows.get('a').deleted_at, '2026-11-01T02:00:00Z');
});

test('取り消し → 元に戻す を未送信のうちに続けても、最後の状態が届く', async () => {
  const server = fakeServer();
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  await queue.sync();
  server.failWith(() => networkError());
  queue.setDeleted('a', '2026-11-01T01:00:00Z');
  queue.setDeleted('a', null);
  server.failWith(null);
  await queue.sync();
  assert.equal(server.rows.get('a').deleted_at, null);
  assert.deepEqual(server.calls.filter((c) => c[0] === 'void'), [['void', 'a', null]]);
});

test('送信中に追加された記録も続けて送られる', async () => {
  const raw = rawStorage();
  const server = fakeServer();
  let queue;
  let first = true;
  server.failWith((kind) => {
    if (kind === 'insert' && first) {
      first = false;
      queue.add(row('b'));
    }
    return null;
  });
  queue = queueOn(raw, server);
  queue.add(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual([...server.rows.keys()], ['a', 'b']);
});

test('不正な記録だけが「送信できない記録」に移り、残りは送られる', async () => {
  const server = fakeServer();
  server.failWith((kind, list) => (kind === 'insert' && list.some((r) => r.id === 'bad') ? dataError() : null));
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  queue.add(row('bad'));
  queue.add(row('c'));
  await queue.sync();
  assert.equal(queue.size(), 0);
  assert.deepEqual([...server.rows.keys()], ['a', 'c']);
  assert.deepEqual(queue.dead().map((entry) => entry.id), ['bad']);
});

test('送信できなかった記録は、サーバー側を直したあと retryDead で送り直せる（取り消しも反映）', async () => {
  const raw = rawStorage();
  const server = fakeServer();
  server.failWith(() => dataError());
  const strict = queueOn(raw, server);
  strict.add(row('a'));
  await strict.sync();
  assert.equal(strict.dead().length, 1);
  strict.setDeleted('a', '2026-11-01T01:00:00Z'); // 保留中に取り消した

  server.failWith(null);
  const reopened = queueOn(raw, server);
  reopened.retryDead();
  assert.equal(reopened.dead().length, 0);
  await reopened.sync();
  assert.equal(reopened.size(), 0);
  assert.equal(server.rows.get('a').deleted_at, '2026-11-01T01:00:00Z');
});

test('設定ミスなど記録のせいではないエラーでは、記録を捨てない', async () => {
  const server = fakeServer();
  server.failWith(() => Object.assign(new Error('permission denied'), { code: '42501' }));
  const queue = queueOn(rawStorage(), server);
  queue.add(row('a'));
  await queue.sync();
  assert.equal(queue.size(), 1);
  assert.equal(queue.dead().length, 0);
  assert.equal(queue.lastError().message, 'permission denied');
});

test('以前の形式で残っていた未送信分も送られる', async () => {
  const raw = rawStorage();
  raw.setItem(
    'balloon.queue',
    JSON.stringify([
      { row: row('old1'), v: '1-1' },
      { row: row('old2', { deleted_at: '2026-11-01T01:00:00Z' }), v: '1-2' },
    ]),
  );
  raw.setItem('balloon.queue.dead', JSON.stringify([{ row: row('old3'), error: 'x' }]));
  const server = fakeServer();
  server.rows.set('old2', row('old2')); // 登録は届いていて、取り消しだけ未送信だった
  const queue = queueOn(raw, server);
  assert.equal(queue.size(), 2);
  queue.retryDead();
  await queue.sync();
  assert.deepEqual([...server.rows.keys()].sort(), ['old1', 'old2', 'old3']);
  assert.equal(server.rows.get('old2').deleted_at, '2026-11-01T01:00:00Z');
  assert.equal(queue.size(), 0);
});

test('保存できない環境でもメモリ上で動く', async () => {
  const server = fakeServer();
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const queue = queueOn(broken, server);
  queue.add(row('a'));
  await queue.sync();
  assert.ok(server.rows.has('a'));
});
