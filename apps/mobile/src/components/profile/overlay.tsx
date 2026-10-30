import { CatalystActionSheetItem, CatalystDivider, CatalystText } from "@/components/design-system";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { topInsetFor } from "@/lib/device-layout";
import { clientAtom } from "@/models/atoms/credential";
import { CatalystRelationships, EgeriaUser } from "@/models/sdk-types";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { ArrowLeft, Ellipsis, Flag, ShareIcon, ShieldBan } from "lucide-react-native";
import { useCallback, useRef } from "react";
import { Animated, Platform, Share, StyleSheet, TouchableOpacity, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const UniAnimatedView = withUniwind(Animated.View);
const UniArrowLeft = withUniwind(ArrowLeft);
const UniEllipsis = withUniwind(Ellipsis);
const UniFlag = withUniwind(Flag);
const UniShare = withUniwind(ShareIcon);
const UniShieldBan = withUniwind(ShieldBan);

type Props = {
  user: EgeriaUser | null;
  relationships?: CatalystRelationships | null;
  scrollY: Animated.Value;
  showBackButton?: boolean;
  onUpdateRelationships?: (relationships: CatalystRelationships) => void;
};

export const ProfileOverlay = ({ user, relationships, scrollY, showBackButton = true }: Props) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useAtomValue(clientAtom);
  // ステータスバーがなくても (iPhone Duo)、画面の丸い角に掛からないよう上を空ける
  const topInset = topInsetFor(insets.top);
  const overlayHeight = topInset + 44;
  const overlayOpacity = scrollY.interpolate({
    inputRange: [0, 32],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const handleBack = useCallback(() => router.back(), [router]);
  const sheet = useRef<BottomSheetModal>(null);
  const theme = useColorScheme() ?? "light";
  const url = `https://catalyst.natsuneko.com/@${user?.screenName}`;
  const handleSheetOpen = useCallback(() => sheet.current?.present(), []);
  const handleShareUser = useCallback(() => {
    sheet.current?.dismiss();
    if (Platform.OS === "ios") {
      Share.share({
        message: `${user?.displayName} (@${user?.screenName})`,
        url: url,
      });
    } else {
      Share.share({
        message: `${user?.displayName} (@${user?.screenName})\n${url}`,
      });
    }
  }, [user, url]);
  const handleToggleBlock = useCallback(async () => {
    sheet.current?.dismiss();

    if (!user || !relationships) return;

    const isBlocking = relationships.isBlocking;
    if (isBlocking) {
      await client.catalyst.v1.blocks.delete({ body: { userId: user.id }, throwOnError: true });
    } else {
      await client.catalyst.v1.blocks.create({ body: { userId: user.id }, throwOnError: true });
    }
  }, [user, relationships, client]);
  const handleReportUser = useCallback(() => {
    sheet.current?.dismiss();
    if (!user) return;
    router.push(`/report/${user.id}?type=user`);
  }, [user, router]);
  const renderSheetBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    [],
  );

  return (
    <View
      className="absolute left-0 right-0 top-0 flex-row w-full"
      style={{
        height: overlayHeight,
        paddingTop: topInset,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <UniAnimatedView
        className="bg-light-background dark:bg-dark-surface"
        style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
      />
      <View className="relative flex-row flex-1 items-center">
        <UniAnimatedView
          className="flex-1 flex-row items-center justify-center gap-1 px-16"
          style={{ opacity: overlayOpacity }}
        >
          <CatalystText variant="subtitle" className="shrink text-center" numberOfLines={1}>
            {user?.displayName}
          </CatalystText>
          <ProfileEmoji emoji={user?.profileEmoji} size={16} />
        </UniAnimatedView>

        {showBackButton && (
          <TouchableOpacity className="absolute p-2 m-2" onPress={handleBack}>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-black/60">
              <UniArrowLeft size={18} className="text-white" />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity className="absolute right-0 p-2 m-2" onPress={handleSheetOpen}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-black/60">
            <UniEllipsis size={18} className="text-white" />
          </View>
        </TouchableOpacity>
      </View>
      <BottomSheetModal
        ref={sheet}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderSheetBackdrop}
        backgroundStyle={{ backgroundColor: theme === "dark" ? "#1C1C1E" : "#FFFFFF" }}
        handleIndicatorStyle={{ backgroundColor: theme === "dark" ? "#48484A" : "#C7C7CC" }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom * 2 }}>
          <CatalystActionSheetItem
            icon={UniShare}
            tone="accent"
            title={
              <View className="flex-row items-center">
                <CatalystText variant="subtitle" tone="accent" numberOfLines={1} ellipsizeMode="tail" className="shrink text-[15px] font-semibold">
                  @{user?.screenName}
                </CatalystText>
                <CatalystText variant="subtitle" tone="accent" className="shrink-0 text-[15px] font-semibold">
                  さんを共有する
                </CatalystText>
              </View>
            }
            onPress={handleShareUser}
          />
          {!relationships?.isMyself && (
            <>
              <CatalystDivider className="ml-14 w-auto" />
              <CatalystActionSheetItem
                icon={UniShieldBan}
                tone="destructive"
                title={
                  <View className="flex-row items-center">
                    <CatalystText variant="subtitle" tone="danger" numberOfLines={1} ellipsizeMode="tail" className="shrink text-[15px] font-semibold">
                      @{user?.screenName}
                    </CatalystText>
                    <CatalystText variant="subtitle" tone="danger" className="shrink-0 text-[15px] font-semibold">
                      {`さんをブロック${relationships?.isBlocking ? "解除" : ""}`}
                    </CatalystText>
                  </View>
                }
                onPress={handleToggleBlock}
              />
            </>
          )}
          {!relationships?.isMyself && (
            <>
              <CatalystDivider className="ml-14 w-auto" />
              <CatalystActionSheetItem
                icon={UniFlag}
                tone="destructive"
                title={
                  <View className="flex-row items-center">
                    <CatalystText variant="subtitle" tone="danger" numberOfLines={1} ellipsizeMode="tail" className="shrink text-[15px] font-semibold">
                      @{user?.screenName}
                    </CatalystText>
                    <CatalystText variant="subtitle" tone="danger" className="shrink-0 text-[15px] font-semibold">
                      さんを報告
                    </CatalystText>
                  </View>
                }
                onPress={handleReportUser}
              />
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};
