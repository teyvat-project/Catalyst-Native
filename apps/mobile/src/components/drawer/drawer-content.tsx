import {
  CatalystAvatar,
  CatalystButton,
  CatalystButtonIcon,
  CatalystButtonText,
  CatalystDivider,
  CatalystListItem,
  CatalystListItemContent,
  CatalystText,
} from "@/components/design-system";
import { ProfileEmoji } from "@/components/user/profile-emoji";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { topInsetFor } from "@/lib/device-layout";
import { getCdnUrl } from "@/lib/media";
import { accountAtom } from "@/models/atoms/account";
import { clientAtom } from "@/models/atoms/credential";
import * as Credential from "@/models/credential";
import type { EgeriaUser } from "@/models/sdk-types";
import { DrawerActions } from "expo-router/react-navigation";
import type { DrawerNavigationHelpers } from "expo-router/build/react-navigation/drawer/types";
import { router } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { CalendarDays, ChevronRight, Cog, Images, LogIn, Trophy, User } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

type RelationshipCounts = {
  followers: number | null;
  followings: number | null;
};

type DrawerRoute = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
};

const UniUser = withUniwind(User);
const UniTrophy = withUniwind(Trophy);
const UniCalendarDays = withUniwind(CalendarDays);
const UniImages = withUniwind(Images);
const UniCog = withUniwind(Cog);
const UniLogIn = withUniwind(LogIn);
const UniChevronRight = withUniwind(ChevronRight);

type DrawerMenuItemProps = {
  route: DrawerRoute;
  navigation: DrawerNavigationHelpers;
  showDivider: boolean;
};

const DrawerMenuItem = ({ route, navigation, showDivider }: DrawerMenuItemProps) => {
  const Icon = route.icon;

  const onPress = useCallback(() => {
    navigation.dispatch(DrawerActions.closeDrawer());
    router.push(route.href as never);
  }, [route.href, navigation]);

  return (
    <View>
      <CatalystListItem divided={false} className="min-h-14 px-5 py-3.5" onPress={onPress}>
        <Icon className="text-light-icon dark:text-dark-icon" size={22} />
        <CatalystListItemContent className="gap-0">
          <CatalystText variant="subtitle" className="text-[15px] font-semibold">
            {route.name}
          </CatalystText>
        </CatalystListItemContent>
        <UniChevronRight className="text-light-text-subtle dark:text-dark-text-subtle" size={19} />
      </CatalystListItem>
      {showDivider && <CatalystDivider className="ml-14 w-auto" />}
    </View>
  );
};

type UserProfile = NonNullable<EgeriaUser["profile"]>;

type DrawerProfileSectionProps = {
  navigation: DrawerNavigationHelpers;
  counts: RelationshipCounts | null;
  profile: UserProfile;
  user: EgeriaUser;
};

const DrawerProfileSection = ({ navigation, counts, profile, user }: DrawerProfileSectionProps) => {
  const closeAndNavigate = useCallback(
    (href: string) => {
      navigation.dispatch(DrawerActions.closeDrawer());
      router.push(href as never);
    },
    [navigation],
  );

  return (
    <View className="px-5 pb-5 pt-4">
      <Pressable className="active:opacity-80" onPress={() => closeAndNavigate(`/user/${user.screenName}`)}>
        <CatalystAvatar
          alt={user.displayName}
          className="size-24"
          fallback={user.displayName}
          size="xl"
          source={getCdnUrl({
            src: profile.iconUrl,
            variant: "icon",
            width: 192,
          })}
        />

        <View className="mt-3">
          <View className="flex-row items-center gap-1.5">
            <CatalystText variant="title" numberOfLines={1} className="shrink">
              {user.displayName}
            </CatalystText>
            <ProfileEmoji emoji={user.profileEmoji} size={20} />
          </View>
          <CatalystText variant="mono" tone="muted" className="mt-0.5">
            @{user.screenName}
          </CatalystText>
        </View>
      </Pressable>

      <View className="mt-4 flex-row gap-5">
        <Pressable
          className="flex-row items-baseline gap-1 active:opacity-80"
          onPress={() => closeAndNavigate(`/user/${user.screenName}/followings`)}
          disabled={counts === null || counts.followings === null}
        >
          <CatalystText variant="label">
            {counts === null || counts.followings === null ? "-" : counts.followings}
          </CatalystText>
          <CatalystText variant="body" tone="muted">
            フォロー
          </CatalystText>
        </Pressable>
        <Pressable
          className="flex-row items-baseline gap-1 active:opacity-80"
          onPress={() => closeAndNavigate(`/user/${user.screenName}/followers`)}
          disabled={counts === null || counts.followers === null}
        >
          <CatalystText variant="label">
            {counts === null || counts.followers === null ? "-" : counts.followers}
          </CatalystText>
          <CatalystText variant="body" tone="muted">
            フォロワー
          </CatalystText>
        </Pressable>
      </View>

      <CatalystDivider className="mt-5" />
    </View>
  );
};

type DrawerLoginSectionProps = {
  navigation: DrawerNavigationHelpers;
  onLogin: () => Promise<void>;
};

const DrawerLoginSection = ({ navigation, onLogin }: DrawerLoginSectionProps) => {
  const handlePress = useCallback(async () => {
    navigation.dispatch(DrawerActions.closeDrawer());
    await onLogin();
  }, [navigation, onLogin]);

  return (
    <View className="px-5 py-6">
      <CatalystButton className="w-full" onPress={handlePress}>
        <CatalystButtonIcon>
          <UniLogIn />
        </CatalystButtonIcon>
        <CatalystButtonText>ログイン</CatalystButtonText>
      </CatalystButton>
      <CatalystDivider className="mt-6" />
    </View>
  );
};

type Props = {
  navigation: DrawerNavigationHelpers;
};

export const DrawerContent = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useAtom(accountAtom);
  const client = useAtomValue(clientAtom);
  const [counts, setCounts] = useState<RelationshipCounts | null>(null);

  const mainRoutes: DrawerRoute[] = useMemo(
    () =>
      [
        account?.user.profile && {
          name: "プロフィール",
          href: `/user/${account.user.screenName ?? ""}`,
          icon: UniUser,
        },
        {
          name: "コンテスト",
          href: "/contest",
          icon: UniTrophy,
        },
        {
          name: "お題",
          href: "/theme",
          icon: UniCalendarDays,
        },
        {
          name: "ギャラリー",
          href: "/gallery",
          icon: UniImages,
        },
      ].filter(Boolean) as DrawerRoute[],
    [account],
  );

  const footerRoutes: DrawerRoute[] = useMemo(
    () => [
      {
        name: "設定とプライバシー",
        href: "/settings",
        icon: UniCog,
      },
    ],
    [],
  );

  const handleLogin = useCallback(async () => {
    const { credential, isLoggedIn, user } = await Credential.login();
    if (isLoggedIn && user) {
      setAccount({ user, credential });
    }
  }, [setAccount]);

  useAsyncEffect(async () => {
    const screenName = account?.user.screenName;
    if (!screenName) {
      setCounts(null);
      return;
    }

    const { data: c } = await client.catalyst.v1.relationships.by.username.username.counts.get({
      path: { username: screenName },
      throwOnError: true,
    });
    setCounts(c);
  }, [account?.user.screenName, client.catalyst]);

  return (
    // ドロワーは画面の左に出るので、右のセーフエリア (iPhone Duo のステータス表示など) は避けなくていい。
    // 上は、ステータスバーがなくても画面の丸い角に掛からないよう最低限空ける
    <SafeAreaView
      edges={["bottom", "left"]}
      className="flex-1 bg-light-background dark:bg-dark-surface"
      style={{ paddingTop: topInsetFor(insets.top) }}
    >
      {account?.user.profile != null ? (
        <DrawerProfileSection
          navigation={navigation}
          counts={counts}
          profile={account.user.profile}
          user={account.user}
        />
      ) : (
        <DrawerLoginSection navigation={navigation} onLogin={handleLogin} />
      )}

      <View>
        {mainRoutes.map((route, index) => (
          <DrawerMenuItem
            key={route.name}
            route={route}
            navigation={navigation}
            showDivider={index < mainRoutes.length - 1}
          />
        ))}
      </View>

      {footerRoutes.length > 0 && <CatalystDivider />}

      <View>
        {footerRoutes.map((route, index) => (
          <DrawerMenuItem
            key={route.name}
            route={route}
            navigation={navigation}
            showDivider={index < footerRoutes.length - 1}
          />
        ))}
      </View>
    </SafeAreaView>
  );
};
