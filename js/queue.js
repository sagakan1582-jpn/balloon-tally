// 未送信キュー。登録・取り消し・復元はまず端末の保存領域に入り、サーバーへ送れたものから消える。
//
// - 新しい記録は「同じ id がすでにあれば何もしない」形で送る。何度再送しても二重登録にならず、
//   サーバー側の内容（PC で取り消した印など）を上書きすることもない。
// - 取り消し／復元は、取り消し印（deleted_at）だけを書き換える別の操作として送る。
// - 操作のたびに保存領域の最新の内容を読み直してから書き換える。同じ端末で画面を複数開いていても、
//   お互いの未送信分を消さない。

// 22xxx（値の形式）/ 23xxx（制約違反）は、その記録を何度送っても通らないエラー。
const isDataError = (err) => /^(22|23)/.test(err?.code ?? '');

// 以前の形式（{ row, v }：行まるごとを送っていた）で残っている未送信分を、今の形式に直す。
function normalize(entry) {
  if (entry?.kind) return [entry];
  if (!entry?.row?.id) return [];
  const v = entry.v ?? `legacy-${entry.row.id}`;
  const insert = { kind: 'insert', id: entry.row.id, row: entry.row, v, error: entry.error };
  if (!entry.row.deleted_at) return [insert];
  return [insert, { kind: 'void', id: entry.row.id, deletedAt: entry.row.deleted_at, v: `${v}-void` }];
}

// storage は例外を投げないもの（createSafeStorage）を渡す。
// insert(rows) / setDeleted(id, deletedAt) は失敗時に { code } つきのエラーを投げる。
export function createQueue({ storage, insert, setDeleted, key = 'balloon.queue' }) {
  const deadKey = `${key}.dead`;
  let seq = 0;
  let syncing = false;
  let lastError = null;
  const listeners = new Set();

  // 画面をまたいでも重ならない版番号
  const newVersion = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${++seq}`;
  const read = (k) => {
    try {
      return (JSON.parse(storage.getItem(k)) ?? []).flatMap(normalize);
    } catch {
      return [];
    }
  };
  const update = (k, change) => storage.setItem(k, JSON.stringify(change(read(k))));
  const notify = () => listeners.forEach((listener) => listener());

  // 送った版だけを消す。送信中に同じ記録が更新されていても、新しい版は残る。
  function settle(sent) {
    const done = new Set(sent.map((entry) => entry.v));
    update(key, (list) => list.filter((entry) => !done.has(entry.v)));
  }

  function bury(entry, err) {
    settle([entry]);
    update(deadKey, (list) => [...list, { ...entry, error: err.message }]);
  }

  async function sendInserts(batch) {
    try {
      await insert(batch.map((entry) => entry.row));
      settle(batch);
    } catch (err) {
      if (!isDataError(err)) {
        lastError = err;
        return;
      }
      // 1 件の不正な記録で全体が詰まらないよう、1 件ずつ送り直して切り分ける。
      for (const entry of batch) {
        try {
          await insert([entry.row]);
          settle([entry]);
        } catch (oneErr) {
          if (!isDataError(oneErr)) {
            lastError = oneErr;
            return;
          }
          bury(entry, oneErr);
        }
      }
    }
  }

  async function sendVoid(entry) {
    try {
      await setDeleted(entry.id, entry.deletedAt);
      settle([entry]);
    } catch (err) {
      if (isDataError(err)) bury(entry, err);
      else lastError = err;
    }
  }

  // 新しい記録を先に送り、すべて届いてから取り消し／復元を送る（記録より先に取り消しが届かないように）。
  async function sync() {
    if (syncing) return;
    syncing = true;
    lastError = null;
    try {
      while (!lastError) {
        const entries = read(key);
        const inserts = entries.filter((entry) => entry.kind === 'insert');
        if (inserts.length) {
          await sendInserts(inserts.slice(0, 100));
        } else {
          const next = entries.find((entry) => entry.kind === 'void');
          if (!next) break;
          await sendVoid(next);
        }
        notify();
      }
    } finally {
      syncing = false;
      notify();
    }
  }

  return {
    add(row) {
      update(key, (list) => [
        ...list.filter((entry) => !(entry.kind === 'insert' && entry.id === row.id)),
        { kind: 'insert', id: row.id, row, v: newVersion() },
      ]);
      notify();
    },
    // 取り消し（deletedAt に時刻）／復元（null）。
    setDeleted(id, deletedAt) {
      const apply = (entry) =>
        entry.kind === 'insert' && entry.id === id ? { ...entry, row: { ...entry.row, deleted_at: deletedAt } } : entry;
      // まだ送っていない新規記録にも反映しておく（その記録がこれから作られる場合に正しい状態で届くように）。
      update(key, (list) => [
        ...list.filter((entry) => !(entry.kind === 'void' && entry.id === id)).map(apply),
        { kind: 'void', id, deletedAt, v: newVersion() },
      ]);
      update(deadKey, (list) => list.map(apply));
      notify();
    },
    // 送れなかった記録をキューに戻す。サーバー側の設定を直したあとに開き直せば送り直される。
    retryDead() {
      const dead = read(deadKey);
      if (!dead.length) return;
      storage.setItem(deadKey, '[]');
      update(key, (list) => [
        ...list,
        ...dead
          .filter((entry) => !list.some((queued) => queued.v === entry.v))
          .map(({ error, ...entry }) => entry),
      ]);
      notify();
    },
    sync,
    // 未送信の記録の数（同じ記録への登録と取り消しは 1 件と数える）。
    size: () => new Set(read(key).map((entry) => entry.id)).size,
    dead: () => read(deadKey),
    lastError: () => lastError,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // ほかの画面がキューを変えたときに呼ぶ。
    notify,
  };
}
