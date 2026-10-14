// 端末の保存領域（localStorage）の包み。読み書きで例外を投げない。
// 使えない・満杯のときは、以後この画面を開いているあいだだけメモリで続ける。
// 一度失敗したら保存領域には戻らないので、「書けなかったのに古い値を読む」食い違いが起きない。
export function createSafeStorage(getStorage) {
  const memory = new Map();
  let persistent = true;
  return {
    getItem(key) {
      if (persistent) {
        try {
          const value = getStorage().getItem(key);
          memory.set(key, value);
          return value;
        } catch {
          persistent = false;
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!persistent) return;
      try {
        getStorage().setItem(key, value);
      } catch {
        persistent = false;
      }
    },
    // false なら、画面を閉じるとまだ送っていない記録が消える。
    isPersistent: () => persistent,
  };
}
