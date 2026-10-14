import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage } from '../js/storage.js';

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
  };
}

test('使える環境ではそのまま保存する', () => {
  const raw = fakeStorage();
  const storage = createSafeStorage(() => raw);
  storage.setItem('a', '1');
  assert.equal(raw.data.get('a'), '1');
  assert.equal(storage.getItem('a'), '1');
  assert.equal(storage.isPersistent(), true);
});

test('使えない環境ではメモリで続け、警告できる', () => {
  const storage = createSafeStorage(() => {
    throw new Error('SecurityError');
  });
  storage.setItem('a', '1');
  assert.equal(storage.getItem('a'), '1');
  assert.equal(storage.isPersistent(), false);
});

test('満杯で書けなくなったら、古い値ではなく最後に書いた値を読む', () => {
  const raw = fakeStorage();
  const storage = createSafeStorage(() => raw);
  storage.setItem('a', 'old');
  storage.getItem('b');
  raw.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  storage.setItem('a', 'new');
  assert.equal(storage.getItem('a'), 'new');
  assert.equal(storage.isPersistent(), false);
});
