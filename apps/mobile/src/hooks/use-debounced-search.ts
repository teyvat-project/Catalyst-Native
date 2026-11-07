import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  delay?: number;
  // 空欄のときは取得せず結果を空にする (ユーザー検索のように、空の問い合わせに意味がない場合)
  skipEmpty?: boolean;
};

// 入力が止まってから検索する。速く打つと古い問い合わせの結果が後から届くことがあるので、
// 最後に投げた問い合わせの結果だけを採用する
export const useDebouncedSearch = <T>(
  query: string,
  fetcher: (q: string) => Promise<T[]>,
  { delay = 300, skipEmpty = false }: Options = {},
) => {
  const [results, setResults] = useState<T[]>([]);
  // results がどの問い合わせの結果か。入力中は query と食い違うので、結果に合わせて出し分けたいときに使う
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestRef.current;

    if (skipEmpty && query.trim() === "") {
      setResults([]);
      setResultsQuery(query);
      setIsLoading(false);
      setIsError(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      fetcher(query)
        .then((items) => {
          if (requestId !== latestRequestRef.current) return;
          setResults(items);
          setResultsQuery(query);
          setIsError(false);
        })
        .catch(() => {
          if (requestId !== latestRequestRef.current) return;
          setIsError(true);
        })
        .finally(() => {
          if (requestId === latestRequestRef.current) setIsLoading(false);
        });
    }, delay);

    return () => clearTimeout(timer);
  }, [query, fetcher, delay, skipEmpty, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { results, resultsQuery, isLoading, isError, retry };
};
