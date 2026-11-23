import { clientAtom } from "@/models/atoms/credential";
import { passphraseUnlockRevisionAtomFamily } from "@/models/atoms/passphrase";
import type { CatalystStatusV1_1 } from "@/models/sdk-types";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

type LockableStatus = {
  id: string;
  locked?: boolean;
  user?: { id: string } | null;
};

/**
 * 合言葉付きでまだ解除していない投稿 (一覧には本文と画像を抜いた形で届く) を、解除できたら取り直して返す。
 * 合言葉は投稿者ごとに共通なので、他の投稿で同じ投稿者の合言葉が解除されたときも取り直す。
 * 鍵が掛かっていない投稿や、まだ解除していないあいだは null を返す。
 */
export const useUnlockedStatus = (status: LockableStatus) => {
  const client = useAtomValue(clientAtom);
  const isLocked = status.locked === true;
  const unlockRevision = useAtomValue(passphraseUnlockRevisionAtomFamily(status.user?.id ?? ""));
  const initialRevisionRef = useRef(unlockRevision);
  const [unlocked, setUnlocked] = useState<CatalystStatusV1_1 | null>(null);

  useEffect(() => {
    if (!isLocked || unlocked || unlockRevision === initialRevisionRef.current) return;

    let ignore = false;
    client.catalyst.v11.status.id
      .get({ path: { id: status.id } })
      .then(({ data }) => {
        if (!ignore && data && !data.status.locked) setUnlocked(data.status);
      })
      // 取り直せなくても鍵付きのままで問題ない
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [client, isLocked, status.id, unlockRevision, unlocked]);

  // その場で解除できたとき (解除 API が返した投稿をそのまま使う)
  const markUnlocked = useCallback((s: CatalystStatusV1_1) => setUnlocked(s), []);

  return { unlocked, markUnlocked };
};
