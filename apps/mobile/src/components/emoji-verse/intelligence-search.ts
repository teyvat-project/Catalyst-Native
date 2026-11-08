// Web 版の絵文字ピッカーの「Intelligence Search」と同じく、言い回しや場面から意味の近い絵文字を paimon で探す。
//
// paimon の検索 API は CatalystSDK に入っていない (公開 API ではない) ので、Web 版と同じエンドポイントを直接呼ぶ。
// ログインしていれば、Catalyst のトークンを付けて呼ぶ。
// 結果はピッカーにある絵文字に置き換えて表示するので、ピッカーから除外したカテゴリの絵文字は出てこない。

import type {
  EmojiCategory,
  EmojiItem,
  EmojiSearchProvider,
  EmojiSearchResult,
} from "@natsuneko-laboratory/react-native-emoji-verse";
import type { Catalyst } from "@natsuneko-laboratory/catalyst-sdk";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { accountAtom } from "@/models/atoms/account";

const PAIMON_SEARCH = "https://paimon.natsuneko.com/v1/search";
const SEARCH_LIMIT = 50;
// 同じ言葉で探し直したときに待たずに出すため、探した結果を投稿によらず覚えておく。
// paimon の結果が変わることもあるので、メモリにだけ置いてアプリを終えたら消し、起動したままでも一定時間で捨てる
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_SIZE = 20;

type PaimonSearchResponse = {
  results?: { emoji: string }[];
  /** ベクトル検索が使えず、キーワードの一致だけで探したとき true */
  degraded?: boolean;
};

// paimon は 🏖️ のように U+FE0F を付けて返すが、ピッカーのデータと付き方がそろうとは限らないので、外して照らし合わせる
const normalize = (emoji: string) => emoji.replace(/\uFE0F/g, "");

/** paimon が返した絵文字を、ピッカーにある絵文字に置き換える。ピッカーにないものは捨てる */
export function matchPickerEmojis(
  results: readonly { emoji: string }[],
  categories: readonly EmojiCategory[],
): EmojiItem[] {
  const index = new Map<string, EmojiItem>();
  for (const category of categories) {
    for (const item of category.emojis) {
      if (item.type.kind !== "unicode") continue;
      const key = normalize(item.type.emoji);
      if (!index.has(key)) index.set(key, item);
    }
  }

  const seen = new Set<string>();
  return results.flatMap(({ emoji }) => {
    const key = normalize(emoji);
    const item = index.get(key);
    if (!item || seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
}

// ピッカーを開き直すたびにカテゴリを作り直すので、結果は paimon の応答のまま覚えておき、出すときに置き換える
const cache = new Map<
  string,
  {
    response: PaimonSearchResponse;
    at: number;
    // peek は描画のたびに呼ばれるので、置き換えた結果をカテゴリごとに覚えておく。同じ配列を返せば一覧も描き直されない
    result?: { categories: readonly EmojiCategory[]; value: EmojiSearchResult };
  }
>();

function toSearchResult(response: PaimonSearchResponse, categories: readonly EmojiCategory[]): EmojiSearchResult {
  return {
    items: matchPickerEmojis(response.results ?? [], categories),
    message:
      response.degraded === true
        ? "いまはキーワードの一致だけで探しています。結果が少なかったり、ずれていたりすることがあります。"
        : undefined,
  };
}

function peekCache(query: string, categories: readonly EmojiCategory[]) {
  const entry = cache.get(query);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(query);
    return undefined;
  }
  if (entry.result?.categories !== categories) {
    entry.result = { categories, value: toSearchResult(entry.response, categories) };
  }
  return entry.result.value;
}

function fetchSearch(url: string, accessToken: string | undefined, signal: AbortSignal) {
  return fetch(url, { signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined });
}

// トークンの期限が切れていたら、SDK と同じく 1 回だけ更新して送り直す。更新できなければトークンを付けずに送り直す
async function fetchWithToken(url: string, client: Catalyst | undefined, signal: AbortSignal) {
  const accessToken = client?.accessToken;
  const res = await fetchSearch(url, accessToken, signal);
  if (res.status !== 401 || !client || !accessToken) return res;

  const refreshed = await client.refresh().then(
    (token) => token.accessToken,
    () => undefined,
  );
  return fetchSearch(url, refreshed, signal);
}

async function searchByMeaning(
  query: string,
  categories: readonly EmojiCategory[],
  client: Catalyst | undefined,
  signal: AbortSignal,
): Promise<EmojiSearchResult> {
  const url = `${PAIMON_SEARCH}?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`;
  const res = await fetchWithToken(url, client, signal);
  if (res.status === 429) {
    return {
      items: [],
      message: "短い時間に検索しすぎたため、一時的に制限されています。1 分ほど待ってからもう一度お試しください。",
    };
  }
  if (!res.ok) throw new Error(`paimon search failed: ${res.status}`);

  const response = (await res.json()) as PaimonSearchResponse;
  // 形の崩れた応答を覚えると、peek が描画中に例外を投げるので、置き換えられた応答だけ覚える
  const result = toSearchResult(response, categories);
  // キーワードの一致だけで探した結果は、paimon が直ったらすぐ探し直せるよう覚えない
  if (response.degraded !== true) {
    cache.delete(query);
    cache.set(query, { response, at: Date.now() });
    // Map は入れた順に並ぶので、先頭がいちばん古い
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return result;
}

/** ピッカーのカテゴリタブの先頭に、意味の近い絵文字を探すタブを追加する */
export function useIntelligenceSearchProvider(categories: readonly EmojiCategory[]): EmojiSearchProvider {
  const client = useAtomValue(accountAtom)?.credential.client;
  return useMemo(
    () => ({
      icon: "sparkles",
      placeholder: "気持ちや場面で探す（例：仕事おわった）",
      idleMessage: "言い回しや場面を入力して検索すると、意味の近い絵文字を探します。",
      // かな漢字変換の途中の読みで探さないよう、また短い時間に探しすぎて制限されないよう、確定してから探す
      searchOn: "submit",
      submitLabel: (query) => `「${query}」で探す`,
      emptyMessage: "見つかりませんでした",
      errorMessage: "絵文字を探せませんでした。しばらくしてからもう一度お試しください。",
      tryLabel: "Intelligence Search で探す",
      search: (query, { signal }) => searchByMeaning(query, categories, client, signal),
      peek: (query) => peekCache(query, categories),
    }),
    [categories, client],
  );
}
