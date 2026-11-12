/**
 * A tiny stand-in for the browser's IndexedDB, enough for
 * `openIndexedDbStore` (open with an upgrade, one object store per
 * transaction, get, put, delete, getAllKeys), with requests that answer on a
 * later tick as the real one does. Values are kept as given (no structured
 * clone). `failWrites` makes every write transaction abort, as a full disk does.
 */
type Handler = ((this: unknown, ev: Event) => unknown) | null;

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  succeed(value: T) {
    this.result = value;
    queueMicrotask(() => this.onsuccess?.call(this, new Event("success")));
  }
}

export class FakeIndexedDb {
  readonly databases = new Map<string, Map<string, Map<string, unknown>>>();
  failWrites = false;
  refuseOpen = false;

  open(name: string): IDBOpenDBRequest {
    const req = new FakeRequest<unknown>() as unknown as FakeRequest<unknown> & { onupgradeneeded: Handler; onblocked: Handler };
    req.onupgradeneeded = null;
    req.onblocked = null;
    const fresh = !this.databases.has(name);
    if (fresh) this.databases.set(name, new Map());
    const stores = this.databases.get(name)!;
    const db = {
      objectStoreNames: { contains: (s: string) => stores.has(s) },
      createObjectStore: (s: string) => stores.set(s, new Map()),
      transaction: (store: string, mode: string) => this.transaction(stores, store, mode),
    };
    setTimeout(() => {
      if (this.refuseOpen) {
        req.error = new DOMException("refused", "SecurityError");
        req.onerror?.call(req, new Event("error"));
        return;
      }
      req.result = db;
      if (fresh) req.onupgradeneeded?.call(req, new Event("upgradeneeded"));
      req.onsuccess?.call(req, new Event("success"));
    }, 0);
    return req as unknown as IDBOpenDBRequest;
  }

  private transaction(stores: Map<string, Map<string, unknown>>, name: string, mode: string) {
    const data = stores.get(name);
    if (!data) throw new DOMException(`no store ${name}`, "NotFoundError");
    const tx = { oncomplete: null as Handler, onerror: null as Handler, onabort: null as Handler, error: null as DOMException | null };
    const failing = mode === "readwrite" && this.failWrites;
    const finish = () =>
      setTimeout(() => {
        if (failing) {
          tx.error = new DOMException("quota", "QuotaExceededError");
          tx.onabort?.call(tx, new Event("abort"));
        } else tx.oncomplete?.call(tx, new Event("complete"));
      }, 0);
    const op = <T>(fn: () => T) => {
      const req = new FakeRequest<T>();
      if (!failing) req.succeed(fn());
      finish();
      return req;
    };
    return Object.assign(tx, {
      objectStore: () => ({
        get: (key: string) => op(() => data.get(key)),
        put: (value: unknown, key: string) => op(() => (data.set(key, value), key)),
        delete: (key: string) => op(() => (data.delete(key), undefined)),
        getAllKeys: () => op(() => [...data.keys()]),
      }),
    });
  }
}
