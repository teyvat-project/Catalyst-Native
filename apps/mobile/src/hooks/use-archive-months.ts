import { useAsyncEffect } from "@/hooks/use-async-effect";
import { clientAtom } from "@/models/atoms/credential";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback, useState } from "react";

export type ArchiveMonth = { year: number; month: number; count: number };

export const formatArchiveMonth = ({ year, month }: Pick<ArchiveMonth, "year" | "month">) => `${year}年${month}月`;

const EMPTY: ArchiveMonth[] = [];

// 月を移るたびに画面が作り直されるので、取得済みの一覧を画面の外に持っておく。
// アカウントを切り替えたときに別の人の一覧を出さないよう、取得したクライアントも覚えておく
const archiveMonthsCacheAtom = atom<{ client: unknown; months: ArchiveMonth[] } | null>(null);

/** 投稿のある月の一覧を新しい順で返す */
export const useArchiveMonths = () => {
  const client = useAtomValue(clientAtom);
  const [cache, setCache] = useAtom(archiveMonthsCacheAtom);
  const [isFetching, setIsFetching] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cached = cache?.client === client ? cache.months : undefined;

  // 前回の一覧を出したまま、裏で取り直す
  useAsyncEffect(async () => {
    if (!client) return;

    setIsFetching(true);
    try {
      const { data } = await client.catalyst.v1.timeline.archive.months.get({ throwOnError: true });
      setCache({
        client,
        months: data.months.filter((w) => w.count > 0).sort((a, b) => b.year - a.year || b.month - a.month),
      });
      setHasError(false);
    } catch (e) {
      console.error(e);
      setHasError(true);
    } finally {
      setIsFetching(false);
    }
  }, [client, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // 前回の一覧があれば、取り直しに失敗してもそれを出し続ける
  return {
    months: cached ?? EMPTY,
    isLoading: cached === undefined && isFetching,
    isError: cached === undefined && hasError,
    reload,
  };
};
