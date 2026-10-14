// サーバー（Supabase）とのやり取りと、未送信キューの実体。
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { jstDayRange } from './core.js';
import { createQueue } from './queue.js';
import { createSafeStorage } from './storage.js';

export const DEMO = !SUPABASE_URL || !SUPABASE_KEY;

export const storage = createSafeStorage(() => window.localStorage);
// 保存できる環境かを最初に確かめておく（できなければ画面に警告を出す）。
storage.setItem('balloon.probe', String(Date.now()));

export function loadJson(key, fallback) {
  try {
    return JSON.parse(storage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export const saveJson = (key, value) => storage.setItem(key, JSON.stringify(value));

const PAGE = 1000; // Supabase が 1 回に返す行数の上限

function supabaseBackend() {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  const table = () => client.from('records');
  const check = ({ error }) => {
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  };
  const inDay = (query, dateStr) => {
    if (!dateStr) return query;
    const [start, end] = jstDayRange(dateStr);
    return query.gte('recorded_at', start).lt('recorded_at', end);
  };

  return {
    // 同じ id の記録がすでにあれば何もしない（再送で既存の内容を上書きしない）。
    async insert(rows) {
      check(await table().upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    },
    // dateStr が null なら全期間。
    async fetchRecords(dateStr) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const result = await inDay(table().select('*'), dateStr)
          .order('recorded_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        check(result);
        rows.push(...result.data);
        if (result.data.length < PAGE) return rows;
      }
    },
    async countDay(dateStr) {
      const result = await inDay(
        table().select('id', { count: 'exact', head: true }),
        dateStr,
      ).is('deleted_at', null);
      check(result);
      return result.count ?? 0;
    },
    async setDeleted(id, deletedAt) {
      check(await table().update({ deleted_at: deletedAt }).eq('id', id));
    },
    subscribe(onChange) {
      const channel = client
        .channel('records-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, onChange)
        .subscribe();
      return () => client.removeChannel(channel);
    },
  };
}

// サーバー未設定のときの代役。同じブラウザのタブ同士でだけ共有される。
function demoBackend() {
  const KEY = 'balloon.demo.records';
  const listeners = new Set();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('balloon.demo') : null;
  const notify = () => listeners.forEach((listener) => listener());
  channel?.addEventListener('message', notify);

  const all = () => loadJson(KEY, {});
  const commit = (map) => {
    saveJson(KEY, map);
    channel?.postMessage('changed');
    notify();
  };
  const select = (dateStr) => {
    const rows = Object.values(all());
    if (!dateStr) return rows;
    const [start, end] = jstDayRange(dateStr);
    return rows.filter((row) => row.recorded_at >= start && row.recorded_at < end);
  };

  return {
    async insert(rows) {
      const map = all();
      for (const row of rows) {
        if (!map[row.id]) map[row.id] = { ...row, received_at: new Date().toISOString() };
      }
      commit(map);
    },
    async fetchRecords(dateStr) {
      return select(dateStr).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    },
    async countDay(dateStr) {
      return select(dateStr).filter((row) => !row.deleted_at).length;
    },
    async setDeleted(id, deletedAt) {
      const map = all();
      if (map[id]) map[id].deleted_at = deletedAt;
      commit(map);
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

export const backend = DEMO ? demoBackend() : supabaseBackend();

export const queue = createQueue({
  storage,
  insert: (rows) => backend.insert(rows),
  setDeleted: (id, deletedAt) => backend.setDeleted(id, deletedAt),
});

// 未送信分を、起動時・電波復帰時・画面に戻ったとき・15 秒ごとに送り直す。
// サーバーに拒否された記録も、起動時に 1 回だけ送り直してみる。
export function startAutoSync() {
  const run = () => queue.sync();
  // 同じ端末のほかの画面がキューを変えたら、表示を合わせる。
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('balloon.queue')) queue.notify();
  });
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });
  setInterval(run, 15000);
  queue.retryDead();
  run();
}
