import { cn } from "@/lib/utils";
import type { CatalystStatusPrivacy } from "@/models/sdk-types";
import { KeyRound, Lock, Users, VolumeX } from "lucide-react-native";
import { Text, View } from "react-native";
import { withUniwind } from "uniwind";

const UniKeyRound = withUniwind(KeyRound);
const UniLock = withUniwind(Lock);
const UniUsers = withUniwind(Users);
const UniVolumeX = withUniwind(VolumeX);

const CONFIG = {
  quiet_public: { icon: UniVolumeX, label: "静かに公開" },
  followers: { icon: UniUsers, label: "フォロワー" },
  passphrase: { icon: UniKeyRound, label: "合言葉" },
  private: { icon: UniLock, label: "非公開" },
} as const;

type Props = React.ComponentProps<typeof View> & {
  privacy?: CatalystStatusPrivacy;
  // 投稿者本人にだけ API から渡される合言葉
  passphrase?: string;
};

export const StatusVisibilityBadge = ({
  className,
  privacy,
  passphrase,
  ...props
}: Props) => {
  if (!privacy || privacy === "public") return null;

  const { icon: Icon, label } = CONFIG[privacy];

  return (
    <View
      className={cn(
        "shrink-0 flex-row items-center gap-0.5 rounded-full border border-light-border px-1.5 py-0.5 dark:border-dark-border",
        className,
      )}
      {...props}
    >
      <Icon
        size={11}
        className="text-light-text-muted dark:text-dark-text-muted"
      />
      <Text
        className="max-w-40 text-[10px] text-light-text-muted dark:text-dark-text-muted"
        numberOfLines={1}
      >
        {passphrase ? `${label}: ${passphrase}` : label}
      </Text>
    </View>
  );
};
