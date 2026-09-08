export class BoardEntityCache<T> {
  private readonly entries = new Map<string, { signature: string; objects: T[] }>();

  constructor(private readonly destroy: (objects: T[]) => void) {}

  sync(
    desired: ReadonlyMap<string, string>,
    create: (key: string) => T[],
  ): void {
    for (const [key, entry] of this.entries) {
      if (desired.get(key) === entry.signature) continue;
      this.destroy(entry.objects);
      this.entries.delete(key);
    }
    for (const [key, signature] of desired) {
      if (!this.entries.has(key)) this.entries.set(key, { signature, objects: create(key) });
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) this.destroy(entry.objects);
    this.entries.clear();
  }
}
