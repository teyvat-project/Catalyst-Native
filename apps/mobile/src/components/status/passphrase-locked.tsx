import { CatalystAvatar, CatalystText } from "@/components/design-system";
import { PassphraseUnlockForm } from "@/components/status/passphrase-unlock-form";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { getCdnUrl } from "@/lib/media";
import type { CatalystStatusDenied, CatalystStatusV1_1 } from "@/models/sdk-types";
import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { withUniwind } from "uniwind";

const UniKeyRound = withUniwind(KeyRound);

type Props = {
  author: CatalystStatusDenied["author"];
  statusId: string;
  onUnlocked: (status: CatalystStatusV1_1) => void;
};

// 投稿詳細で、合言葉付きの投稿をまだ解除していないときに出す画面
export const StatusPassphraseLocked = ({ author, statusId, onUnlocked }: Props) => {
  const router = useRouter();

  return (
    <ScrollView
      className="flex-1 bg-light-surface-muted dark:bg-dark-background"
      contentContainerClassName="items-center px-6 py-12"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-6 h-14 w-14 items-center justify-center rounded-full border border-light-border bg-light-background dark:border-dark-border dark:bg-dark-surface">
        <UniKeyRound size={24} className="text-light-text-muted dark:text-dark-text-muted" />
      </View>
      <CatalystText variant="title" className="text-center">
        この投稿は合言葉で保護されています
      </CatalystText>
      <CatalystText variant="body" tone="muted" className="mt-3 text-center leading-5">
        {author.displayName} さんの合言葉を入力すると、この投稿を表示できます。
      </CatalystText>

      <Pressable
        accessibilityRole="button"
        className="mt-8 w-full max-w-sm flex-row items-center gap-3 rounded-xl border border-light-border bg-light-background p-3 active:opacity-75 dark:border-dark-border dark:bg-dark-surface"
        onPress={() => router.push(`/user/${author.screenName}`)}
      >
        <CatalystAvatar
          source={author.profile?.iconUrl ? getCdnUrl({ src: author.profile.iconUrl, variant: "icon", width: 96 }) : null}
          fallback={author.displayName}
          size="lg"
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1">
            <CatalystText variant="label" className="min-w-0 shrink" numberOfLines={1}>
              {author.displayName}
            </CatalystText>
            <ProfileEmoji emoji={author.profileEmoji} size={14} />
          </View>
          <CatalystText variant="caption" tone="muted" numberOfLines={1}>
            @{author.screenName}
          </CatalystText>
        </View>
      </Pressable>

      <View className="mt-6 w-full items-center">
        <PassphraseUnlockForm statusId={statusId} authorId={author.id} onUnlocked={onUnlocked} />
      </View>
    </ScrollView>
  );
};
