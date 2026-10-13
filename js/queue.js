// 未送信キュー。登録はまずここに入り、サーバーへ送れたものから消える。
// 行は id ごとに 1 件だけ持ち、行まるごとを upsert するので、何度再送しても二重登録にならない。

// 22xxx（値の形式）/ 23xxx（制約違反）は、その行を何度送っても通らないエラー。
const isDataError = (err) => /^(22|23)/.test(err?.code ?? '');

export function createQueue({ storage, send, key = 'balloon.queue' }) {
  const deadKey = `${key}.dead`;
  const read = (k) => {
    try {
      return JSON.parse(storage.getItem(k)) ?? [];
    } catch {
      return [];
    }
  };

  // 保存に失敗しても（プライベートブラウズ等）メモリ上のキューで動き続ける。
  let entries = read(key);
  let dead = read(deadKey);
  let seq = 0;
  let syncing = false;
  let lastError = null;
  const listeners = new Set();

  function persist() {
    try {
      storage.setItem(key, JSON.stringify(entries));
      storage.setItem(deadKey, JSON.stringify(dead));
    } catch {
      // メモリ上の内容で続行
    }
    listeners.forEach((listener) => listener());
  }

  // 送信中に同じ行が更新された場合（登録直後の取り消し等）、新しい版は消さずに残す。
  function settle(sent) {
    const done = new Set(sent.map((entry) => entry.v));
    entries = entries.filter((entry) => !done.has(entry.v));
  }

  async function sendOneByOne(batch) {
    for (const entry of batch) {
      try {
        await send([entry.row]);
        settle([entry]);
      } catch (err) {
        if (!isDataError(err)) {
          lastError = err;
          return;
        }
        settle([entry]);
        dead.push({ row: entry.row, error: err.message });
      }
    }
  }

  async function sync() {
    if (syncing) return;
    syncing = true;
    lastError = null;
    try {
      while (entries.length && !lastError) {
        const batch = entries.slice(0, 100);
        try {
          await send(batch.map((entry) => entry.row));
          settle(batch);
        } catch (err) {
          // 1 件の不正な行で全体が詰まらないよう、1 件ずつ送り直して切り分ける。
          if (isDataError(err)) await sendOneByOne(batch);
          else lastError = err;
        }
        persist();
      }
    } finally {
      syncing = false;
      persist();
    }
  }

  return {
    put(row) {
      entries = entries.filter((entry) => entry.row.id !== row.id);
      entries.push({ row, v: `${Date.now()}-${++seq}` });
      persist();
    },
    sync,
    size: () => entries.length,
    dead: () => dead.slice(),
    lastError: () => lastError,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
