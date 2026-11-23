import { CatalystAvatar, CatalystText } from "@/components/design-system";
import { PassphraseUnlockForm } from "@/components/status/passphrase-unlock-form";
import { useUnlockedStatus } from "@/hooks/use-unlocked-status";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { rel } from "@/lib/dayjs";
import { getCdnUrl } from "@/lib/media";
import type { CatalystStatus, CatalystStatusV1_1 } from "@/models/sdk-types";
import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { withUniwind } from "uniwind";

const UniKeyRound = withUniwind(KeyRound);

type Props = {
  status: CatalystStatus | CatalystStatusV1_1;
  // 解除できたら、取り直した投稿をふつうの投稿として描く
  renderUnlocked: (status: CatalystStatusV1_1) => ReactNode;
};

// 合言葉付きで、まだ解除していない投稿。一覧には本文と画像を抜いた形で届くので、鍵付きのカードとして出す
export const LockedStatusCard = ({ status, renderUnlocked }: Props) => {
  const router = useRouter();
  const user = status.user!;
  const { unlocked, markUnlocked } = useUnlockedStatus(status);

  if (unlocked) return renderUnlocked(unlocked);

  const navigateToUser = () => router.push(`/user/${user.screenName}`);

  return (
    <View className="bg-light-background px-4 py-3 dark:bg-dark-background">
      <View className="flex-row items-center gap-3">
        <Pressable accessibilityRole="button" className="active:opacity-75" onPress={navigateToUser}>
          <CatalystAvatar
            source={
              user.profile?.iconUrl
                ? getCdnUrl({ src: user.profile.iconUrl, variant: "icon", width: 80 })
                : null
            }
            fallback={user.displayName}
            size="md"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-w-0 flex-1 active:opacity-90"
          onPress={() => router.push(`/status/${status.id}`)}
        >
          <View className="flex-row items-center gap-1">
            <CatalystText variant="label" className="min-w-0 shrink" numberOfLines={1}>
              {user.displayName}
            </CatalystText>
            <ProfileEmoji emoji={user.profileEmoji} size={14} />
          </View>
          <View className="mt-0.5 flex-row items-center">
            <CatalystText variant="caption" tone="muted" numberOfLines={1}>
              @{user.screenName}
            </CatalystText>
            <CatalystText variant="caption" tone="muted">
              {" · "}
              {rel(status.createdAt)}
            </CatalystText>
          </View>
        </Pressable>
      </View>

      <View className="mt-3 items-center gap-3 rounded-lg border border-light-border bg-light-surface-muted px-4 py-5 dark:border-dark-border dark:bg-dark-surface">
        <View className="flex-row items-center gap-2">
          <UniKeyRound size={16} className="text-light-text-muted dark:text-dark-text-muted" />
          <CatalystText variant="label" tone="muted">
            合言葉で閲覧できる投稿
          </CatalystText>
        </View>
        <PassphraseUnlockForm statusId={status.id} authorId={user.id} onUnlocked={markUnlocked} />
      </View>
    </View>
  );
};
