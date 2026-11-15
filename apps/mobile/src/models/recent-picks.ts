import AsyncStorage from "@react-native-async-storage/async-storage";

type Options<T> = {
  storageKey: string;
  max: number;
  // 保存する前に、表示と選択に要るものだけに絞る
  pick: (value: T) => T;
};

export type RecentPicks<T extends { id: string }> = ReturnType<typeof createRecentPicks<T>>;

// 壊れた値や古い形式の値が混ざっていても、ほかの履歴は読み書きできるように、id の無い要素は捨てる
const hasId = (value: unknown): value is { id: string } =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";

// ピッカーで選んだものの履歴を端末に持つ。新しく選んだものを先頭に入れ、上限を超えたら古いものから捨てる
export const createRecentPicks = <T extends { id: string }>({ storageKey, max, pick }: Options<T>) => {
  /** 新しく使ったものを先頭に入れる。同じものは前のものを消して入れ直す */
  const push = (current: readonly T[], added: readonly T[]) => {
    const unique = [...new Map(added.map((value) => [value.id, pick(value)])).values()];
    const ids = new Set(unique.map((value) => value.id));
    return [...unique, ...current.filter((value) => !ids.has(value.id))].slice(0, max);
  };

  // 中身が壊れていれば空として扱うが、読み出し自体に失敗したときは投げる。
  // 空として書き戻すと、一時的な失敗で履歴がまるごと消えるため
  const read = async (): Promise<T[]> => {
    const raw = await AsyncStorage.getItem(storageKey);
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed.filter(hasId) as T[]) : [];
    } catch {
      return [];
    }
  };

  // 読んで書き換える処理が重なると、先に書いた分が消える。読み出しも順番に並べ、選んだ直後に開き直しても入っているようにする
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <R>(task: () => Promise<R>) => {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  };

  const update = (updater: (current: T[]) => T[]) =>
    enqueue(async () => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(updater(await read())));
    });

  return {
    push,
    // 表示するだけなので、読めなければ空にする
    load: () => enqueue(read).catch((): T[] => []),
    record: (added: readonly T[]) => update((current) => push(current, added)),
    forget: (id: string) => update((current) => current.filter((value) => value.id !== id)),
  };
};
