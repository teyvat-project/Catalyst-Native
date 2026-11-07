import { accountAtom } from "@/models/atoms/account";
import type { CatalystCustomReaction, CatalystCustomReactionList } from "@/models/sdk-types";
import {
  emojiToCodepoints,
  type EmojiCategory,
  type EmojiItem,
} from "@natsuneko-laboratory/react-native-emoji-verse";
import {
  EmojiPickerSheet as BaseEmojiPickerSheet,
  type EmojiPickerSheetRef,
} from "@natsuneko-laboratory/react-native-emoji-verse/sheet";
import { useAtomValue } from "jotai";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useDefaultCategories } from "./emoji-data";
import { useEmojiPickerDefaults } from "./emoji-picker-view";
import { getRecentItems, recordUnicodeUsage, recordUrlUsage, toRecentEmojis } from "./frequency-manager";
import { useIntelligenceSearchProvider } from "./intelligence-search";

export type { EmojiPickerSheetRef };

type Props = {
  onReact?: (symbol: string, url?: string, customReactionId?: string) => void;
  onEmojiSelected?: (emoji: EmojiItem) => void;
  includeCatalystReactions?: boolean;
};

export const EmojiPickerSheet = forwardRef<EmojiPickerSheetRef, Props>(
  function EmojiPickerSheet({ onReact, onEmojiSelected, includeCatalystReactions = true }, ref) {
    const account = useAtomValue(accountAtom);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);
    const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
    const [isPresented, setIsPresented] = useState(false);
    const sheetRef = useRef<EmojiPickerSheetRef>(null);
    const defaultCategories = useDefaultCategories();
    const pickerDefaults = useEmojiPickerDefaults();
    // 「最近使用」はリアクションの履歴なので、リアクションを付けるピッカーにだけ出す
    const showsRecent = onReact !== undefined;
    const intelligenceSearch = useIntelligenceSearchProvider(categories);

    useImperativeHandle(ref, () => ({
      open: () => {
        setIsPresented(true);
        sheetRef.current?.open();
      },
      close: () => {
        sheetRef.current?.close();
      },
    }));

    useEffect(() => {
      if (!isPresented) return;

      setIsCategoriesLoading(true);
      let cancelled = false;

      const load = async () => {
        try {
          const [customReactions, userReactionList, recentItems] = await Promise.all([
            account?.credential.client
              ? account.credential.client.catalyst.v1.reactions
                  .get({ throwOnError: true })
                  .then(({ data }) => data)
                  .catch(() => [] as CatalystCustomReaction[])
              : Promise.resolve([] as CatalystCustomReaction[]),
            account?.credential.client
              ? account.credential.client.catalyst.v1.customReactions
                  .get({ throwOnError: true })
                  .then(({ data }) => data)
                  .catch(() => null as CatalystCustomReactionList | null)
              : Promise.resolve(null as CatalystCustomReactionList | null),
            getRecentItems(),
          ]);

          if (cancelled) return;

          const builtCategories: EmojiCategory[] = [];

          const activeUserReactions =
            userReactionList?.items.filter((r) => r.status === "active") ?? [];
          if (activeUserReactions.length > 0) {
            builtCategories.push({
              id: "user-custom",
              title: "マイリアクション",
              icon: "star-plus",
              emojis: activeUserReactions.map((r) => ({
                id: `:${r.shortcode}:`,
                type: { kind: "url" as const, url: r.imageUrl, customReactionId: r.id },
                keywords: [r.displayName, r.shortcode],
              })),
            });
          }

          if (includeCatalystReactions && customReactions.length > 0) {
            builtCategories.push({
              id: "catalyst",
              title: "Catalyst",
              icon: "star",
              emojis: customReactions.map((r) => ({
                id: r.symbol,
                type: { kind: "url" as const, url: r.url },
                keywords: [r.name],
              })),
            });
          }

          builtCategories.push(...defaultCategories);

          // 履歴が空でもタブは出す (空のときは説明を表示し、開いたときは次のカテゴリが選ばれる)
          if (showsRecent) {
            builtCategories.unshift({
              id: "recent",
              title: "最近使用",
              icon: "clock",
              emojis: toRecentEmojis(recentItems, builtCategories),
              emptyMessage: "使ったリアクションがここに表示されます",
            });
          }

          setCategories(builtCategories);
        } catch (e) {
          if (cancelled) return;
          console.error("Failed to load emoji data:", e);
          setCategories(defaultCategories);
        } finally {
          if (!cancelled) {
            setIsCategoriesLoading(false);
          }
        }
      };

      load();

      return () => {
        cancelled = true;
      };
    }, [isPresented, account, defaultCategories, includeCatalystReactions, showsRecent]);

    const handleDismiss = useCallback(() => {
      setIsPresented(false);
      // 前回のカテゴリのまま開くと、それを元に最初のタブが選ばれてしまう (前回は空だった「最近使用」が選ばれない)
      setCategories([]);
      setIsCategoriesLoading(true);
    }, []);

    // シートは選択後に自動で閉じる
    const handleEmojiSelected = useCallback(
      (emoji: EmojiItem) => {
        onEmojiSelected?.(emoji);
        // 「最近使用」はリアクションの履歴なので、プロフィールの絵文字選びなどでは残さない
        if (!onReact) return;

        if (emoji.type.kind === "unicode") {
          const codepoints = emojiToCodepoints(emoji.type.emoji);
          onReact(codepoints);
          recordUnicodeUsage(emoji.type.emoji).catch(() => {});
        } else if (emoji.type.kind === "url") {
          onReact(emoji.id, emoji.type.url, emoji.type.customReactionId);
          recordUrlUsage(emoji.id, emoji.type.url).catch(() => {});
        }
      },
      [onReact, onEmojiSelected],
    );

    return (
      <BaseEmojiPickerSheet
        {...pickerDefaults}
        ref={sheetRef}
        title="リアクションを追加"
        categories={categories}
        isLoading={isCategoriesLoading}
        searchProvider={intelligenceSearch}
        onEmojiSelected={handleEmojiSelected}
        onDismiss={handleDismiss}
      />
    );
  },
);
