import type {
  GetCatalystV11StatusByIdErrors,
  GetCatalystV11StatusByIdResponse,
  GetCatalystV12TimelineHomeResponse,
  GetCatalystV1ActivitypubSettingsResponse,
  GetCatalystV1AlbumByIdByIdResponse,
  GetCatalystV1AlbumSearchResponse,
  GetCatalystV1AnnouncementsResponse,
  GetCatalystV1ContestBySlugBySlugResponse,
  GetCatalystV1CustomReactionsResponse,
  GetCatalystV1FleetByIdReactionsResponse,
  GetCatalystV1FleetByIdResponse,
  GetCatalystV1FleetRingResponse,
  GetCatalystV1ProfileTagsByUserByIdResponse,
  GetCatalystV1ProfileTagsSuggestionsResponse,
  GetCatalystV1ReactionsResponse,
  GetCatalystV1RelationshipsByIdResponse,
  GetCatalystV1RelationshipsByUsernameByUsernameFollowersRemoteResponse,
  GetCatalystV1RelationshipsByUsernameByUsernameFollowersResponse,
  GetCatalystV1SmartAlbumByIdByIdResponse,
  GetCatalystV1StatusByIdReactionsResponse,
  GetCatalystV1TimelineHomeResponse,
  GetCatalystV1UserByIdWatchResponse,
  GetCatalystV1WeeklyThemesCurrentResponse,
  GetEgeriaV1MeResponse,
  GetSteambirdV1NotificationsResponse,
  PatchEgeriaV1MeData,
  PostCatalystV1StatusByIdReportData,
} from "@natsuneko-laboratory/catalyst-sdk";

// --- catalyst ---

export type CatalystStatusV1_1 = GetCatalystV11StatusByIdResponse["status"];
export type CatalystStatus = GetCatalystV1TimelineHomeResponse["statuses"][number];
export type CatalystStatusV1_2 = GetCatalystV12TimelineHomeResponse[number];
export type CatalystStatusPrivacy = NonNullable<CatalystStatusV1_1["privacy"]>;
export type Media = CatalystStatusV1_1["medias"][number];
// 投稿詳細が 403 で返る (フォロワー限定・合言葉付きなど) ときの理由と投稿者
export type CatalystStatusDenied = GetCatalystV11StatusByIdErrors[403]["denied"];

export type CatalystAlbum = GetCatalystV1AlbumByIdByIdResponse;
export type CatalystSmartAlbum = GetCatalystV1SmartAlbumByIdByIdResponse;
export type CatalystAlbumOrSmartAlbum = GetCatalystV1AlbumSearchResponse["albums"][number];
export type CatalystAlbumDisplayMode = CatalystAlbum["mode"];

export type CatalystContest = GetCatalystV1ContestBySlugBySlugResponse["contest"];

export type CatalystWeeklyTheme = NonNullable<
  GetCatalystV1WeeklyThemesCurrentResponse["theme"]
>;

export type CatalystAnnouncement = GetCatalystV1AnnouncementsResponse["announcements"][number];

export type CatalystCustomReactionList = GetCatalystV1CustomReactionsResponse;
export type CatalystUserCustomReaction = CatalystCustomReactionList["items"][number];
// GET /catalyst/v1/reactions — Catalyst 標準搭載のオリジナルリアクション一覧 (ユーザーがアップロードしたカスタムリアクションとは別物)
export type CatalystCustomReaction = GetCatalystV1ReactionsResponse[number];

export type CatalystReaction = GetCatalystV1StatusByIdReactionsResponse["reactions"][string];

export type CatalystRelationships = GetCatalystV1RelationshipsByIdResponse;

export type CatalystUserWatchMode = GetCatalystV1UserByIdWatchResponse["mode"];

export type CatalystActivityPubSettings = GetCatalystV1ActivitypubSettingsResponse;

export type CatalystFollowListItem = GetCatalystV1RelationshipsByUsernameByUsernameFollowersResponse["items"][number];

export type CatalystRemoteFollower = GetCatalystV1RelationshipsByUsernameByUsernameFollowersRemoteResponse["items"][number];

export type CatalystFleet = GetCatalystV1FleetByIdResponse;
export type CatalystFleetRing = GetCatalystV1FleetRingResponse[number];
// GET /catalyst/v1/fleet/{id}/reactions — Fleet に付与されたリアクションの一覧（投稿者本人のみ取得可能）
export type CatalystFleetReaction = GetCatalystV1FleetByIdReactionsResponse[number];

export type ProfileTag = GetCatalystV1ProfileTagsByUserByIdResponse["tags"][number];
export type ProfileTagSuggestion = GetCatalystV1ProfileTagsSuggestionsResponse["tags"][number];

export type ReportRequest = NonNullable<
  PostCatalystV1StatusByIdReportData["body"]
>;
export type ReportTargetType = "status" | "fleet" | "album" | "smartAlbum" | "user";

// --- egeria ---

export type EgeriaUser = GetEgeriaV1MeResponse["user"];
export type EgeriaUserProfile = NonNullable<EgeriaUser["profile"]>;
export type ProfileEmoji = NonNullable<EgeriaUser["profileEmoji"]>;
export type ProfileEmojiRequest = NonNullable<
  PatchEgeriaV1MeData["body"]
>["profileEmoji"];

// --- steambird ---

export type Notification = GetSteambirdV1NotificationsResponse["notifications"][number];
export type NotificationGroup = Notification["entities"][number];
export type NotificationActor = NotificationGroup["occurredBy"];
export type ActivityPubRemoteActor = Extract<NotificationActor, { type: "activitypub-remote-actor" }>;
