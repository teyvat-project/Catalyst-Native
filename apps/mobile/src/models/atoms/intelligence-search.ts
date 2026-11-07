import { atom } from "jotai";

/**
 * 絵文字ピッカーで、直前に意味で探した言葉と、それを探した投稿など。
 * 同じ投稿でピッカーを開き直したときだけ、この言葉から始める
 */
export const intelligenceSearchQueryAtom = atom<{ contextId: string; query: string } | null>(null);
