import { act, renderHook } from "@testing-library/react-native";

import { useDebouncedSearch } from "./use-debounced-search";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useDebouncedSearch", () => {
  it("300ms 待ってから最後の語で 1 回だけ取得する", async () => {
    const fetcher = jest.fn(async (q: string) => [q]);
    const { rerender, result } = await renderHook(({ q }: { q: string }) => useDebouncedSearch(q, fetcher), {
      initialProps: { q: "a" },
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await rerender({ q: "ab" });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("ab");
    expect(result.current.results).toEqual(["ab"]);
  });

  it("古い問い合わせの結果は捨てる", async () => {
    const slow = deferred<string[]>();
    const fetcher = jest.fn((q: string) => (q === "a" ? slow.promise : Promise.resolve(["ab"])));
    const { rerender, result } = await renderHook(({ q }: { q: string }) => useDebouncedSearch(q, fetcher), {
      initialProps: { q: "a" },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await rerender({ q: "ab" });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      slow.resolve(["a"]);
    });

    expect(result.current.results).toEqual(["ab"]);
  });

  it("resultsQuery は結果が届くまで前の問い合わせのままにする", async () => {
    const fetcher = jest.fn(async (q: string) => [q]);
    const { rerender, result } = await renderHook(({ q }: { q: string }) => useDebouncedSearch(q, fetcher), {
      initialProps: { q: "jac" },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await rerender({ q: "" });
    expect(result.current.resultsQuery).toBe("jac");

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.resultsQuery).toBe("");
  });

  it("skipEmpty なら空欄で取得しない", async () => {
    const fetcher = jest.fn(async () => ["x"]);
    const { result } = await renderHook(() => useDebouncedSearch("  ", fetcher, { skipEmpty: true }));

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("失敗したら isError になり、retry で取り直す", async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(["ok"]);
    const { result } = await renderHook(() => useDebouncedSearch("q", fetcher));

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.isError).toBe(true);

    await act(async () => {
      result.current.retry();
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.results).toEqual(["ok"]);
  });
});
