import { atom } from "jotai";
import { atomFamily } from "jotai-family";

// 合言葉は投稿者ごとに共通なので、ある投稿を解除したら同じ投稿者の鍵付きカードも取り直す。
// 投稿者 ID ごとに解除した回数を数え、鍵付きカードはこの値が変わったら投稿を取り直す
export const passphraseUnlockRevisionAtomFamily = atomFamily((_authorId: string) => atom(0));
