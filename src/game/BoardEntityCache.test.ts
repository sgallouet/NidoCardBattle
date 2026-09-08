import { expect, it, vi } from 'vitest';
import { BoardEntityCache } from './BoardEntityCache';

it('creates only the summoned unit and preserves existing render objects', () => {
  const destroy = vi.fn();
  const create = vi.fn((key: string) => [{ key }]);
  const cache = new BoardEntityCache<{ key: string }>(destroy);
  const signatures = new Map([['sites', 'unchanged'], ['unit:commander', '10hp']]);
  cache.sync(signatures, create);
  create.mockClear();
  signatures.set('unit:summoned', 'exhausted');
  cache.sync(signatures, create);
  expect(create.mock.calls).toEqual([['unit:summoned']]);
  expect(destroy).not.toHaveBeenCalled();
  cache.sync(signatures, create);
  expect(create).toHaveBeenCalledTimes(1);
});

it('replaces changed entities, removes departed entities, and clears on shutdown', () => {
  const destroy = vi.fn();
  const create = vi.fn((key: string) => [{ key }]);
  const cache = new BoardEntityCache<{ key: string }>(destroy);
  cache.sync(new Map([['sites', 'neutral'], ['unit:a', '3hp'], ['unit:b', '2hp']]), create);
  const oldObjects = create.mock.results.map((result) => result.value);
  create.mockClear();
  cache.sync(new Map([['sites', 'captured'], ['unit:a', '1hp']]), create);
  expect(destroy.mock.calls.map(([objects]) => objects)).toEqual(oldObjects);
  expect(create.mock.calls).toEqual([['sites'], ['unit:a']]);
  cache.clear();
  expect(destroy).toHaveBeenCalledTimes(5);
  cache.clear();
  expect(destroy).toHaveBeenCalledTimes(5);
  cache.sync(new Map([['sites', 'captured']]), create);
  expect(create).toHaveBeenCalledTimes(3);
});
