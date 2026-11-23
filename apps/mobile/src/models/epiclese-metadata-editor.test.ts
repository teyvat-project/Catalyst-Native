import type { EpicleseStatusMetadataResponse } from "@natsuneko-laboratory/catalyst-sdk";

import {
  applyToAll,
  collectUserProfiles,
  isMetadataConfigured,
  isMetadataDirty,
  MAX_USERS,
  setPlatform,
  toEditableMetadata,
  toEditableWorld,
  toggleUser,
  type EditableMediaMetadata,
  type EditableWorld,
} from "./epiclese-metadata-editor";

type ResponseItem = EpicleseStatusMetadataResponse[string];

const platforms = [
  { id: "p-vrchat", name: "VRChat", description: "", url: null, startAt: null },
  { id: "p-resonite", name: "Resonite", description: "", url: null, startAt: null },
];
const platformObj = platforms[0];
const author = { id: "a-1", platformIdentifier: "usr_1", platform: platformObj, name: "Author" };

const responseItem = (overrides: Partial<ResponseItem>): ResponseItem => ({
  platform: null,
  world: null,
  group: null,
  event: null,
  users: [],
  reference: [],
  ...overrides,
});

const empty = (id: string): EditableMediaMetadata => ({ id, reference: [], privacyMetadata: false });

describe("toEditableMetadata", () => {
  it("Web 版 transform と同じ送信内容になる (往復)", () => {
    const response: EpicleseStatusMetadataResponse = {
      m1: {
        platform: "VRChat",
        world: {
          id: "w-1",
          platformIdentifier: "wrld_1",
          platformOwnerIdentifier: null,
          platform: platformObj,
          name: "Home",
          author,
        },
        group: null,
        event: null,
        users: [{ id: "u-1", screenName: "a", displayName: "A", profile: null }],
        reference: [
          {
            type: "avatar",
            name: "Avatar",
            description: "desc",
            externalUrl: "https://booth.pm/ja/items/1",
            imageUrl: "x",
            author,
            x: 0.25,
            y: 0.5,
            order: 0,
            reference: "i-1",
          },
          {
            type: "cloth",
            name: "Cloth",
            description: "",
            externalUrl: null,
            imageUrl: null,
            author: { ...author, platform: null },
            x: 0.75,
            y: 0.1,
            order: 1,
            reference: "i-2",
          },
        ],
        additionalData: { World: "Home" },
      },
    };

    const result = toEditableMetadata([{ id: "m1", privacyMetadata: true }], response, platforms);

    expect(result).toEqual([
      {
        id: "m1",
        platform: "p-vrchat",
        world: {
          id: "w-1",
          platformIdentifier: "wrld_1",
          platform: "p-vrchat",
          name: "Home",
          author: { id: "a-1", platformIdentifier: "usr_1", platform: "p-vrchat", name: "Author" },
        },
        users: [{ id: "u-1" }],
        reference: [
          {
            x: 0.25,
            y: 0.5,
            order: 0,
            reference: "i-1",
            type: "avatar",
            name: "Avatar",
            description: "desc",
            externalUrl: "https://booth.pm/ja/items/1",
            author: { id: "a-1", platformIdentifier: "usr_1", platform: "p-vrchat", name: "Author" },
          },
          {
            x: 0.75,
            y: 0.1,
            order: 1,
            reference: "i-2",
            type: "cloth",
            name: "Cloth",
            description: "",
            externalUrl: undefined,
            author: { id: "a-1", platformIdentifier: "usr_1", platform: "", name: "Author" },
          },
        ],
        privacyMetadata: true,
      },
    ]);
    expect(result[0].reference).toHaveLength(2);
    expect(result[0].reference[0]).not.toHaveProperty("imageUrl");
    expect(result[0]).not.toHaveProperty("additionalData");
  });

  it('world が null なら undefined、world.platform が null なら ""', () => {
    const [nullWorld] = toEditableMetadata([{ id: "m1" }], { m1: responseItem({ world: null }) }, platforms);
    expect(nullWorld.world).toBeUndefined();

    const [noPlatform] = toEditableMetadata(
      [{ id: "m1" }],
      {
        m1: responseItem({
          world: {
            id: "w-1",
            platformIdentifier: "wrld_1",
            platformOwnerIdentifier: null,
            platform: null,
            name: "Home",
            author: null,
          },
        }),
      },
      platforms,
    );
    expect(noPlatform.world?.platform).toBe("");
    expect(noPlatform.world?.author).toBeNull();
  });

  it("プラットフォーム名が一覧に無ければ platform は undefined", () => {
    const [unknown] = toEditableMetadata([{ id: "m1" }], { m1: responseItem({ platform: "Unknown" }) }, platforms);
    expect(unknown.platform).toBeUndefined();

    const [none] = toEditableMetadata([{ id: "m1" }], { m1: responseItem({ platform: null }) }, platforms);
    expect(none.platform).toBeUndefined();
  });

  it("メタデータが無い写真は空で補い、投稿の写真順に並べる", () => {
    const result = toEditableMetadata(
      [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
      { m3: responseItem({ platform: "Resonite" }), m1: responseItem({ platform: "VRChat" }) },
      platforms,
    );

    expect(result.map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
    expect(result[1]).toEqual({ id: "m2", reference: [], privacyMetadata: false });
  });

  it("投稿に無い写真のメタデータは捨てる", () => {
    const result = toEditableMetadata(
      [{ id: "m1" }],
      { m1: responseItem({}), "m-deleted": responseItem({ platform: "VRChat" }) },
      platforms,
    );

    expect(result).toHaveLength(1);
    expect(result.map((item) => item.id)).not.toContain("m-deleted");
  });

  it("privacyMetadata は投稿の medias から読み、未定義なら false", () => {
    const result = toEditableMetadata(
      [{ id: "m1", privacyMetadata: true }, { id: "m2" }],
      { m1: responseItem({}), m2: responseItem({}) },
      platforms,
    );

    expect(result.map((item) => item.privacyMetadata)).toEqual([true, false]);
  });
});

describe("isMetadataConfigured", () => {
  it("何も無ければ false", () => {
    expect(isMetadataConfigured(empty("m1"))).toBe(false);
    expect(isMetadataConfigured({ ...empty("m1"), users: [] })).toBe(false);
  });

  it("いずれかの項目があれば true", () => {
    const world = { platformIdentifier: "wrld_1", platform: "p-vrchat", name: "Home", author: null };
    const pin = { x: 0, y: 0, type: "avatar" as const, name: "Avatar" };

    expect(isMetadataConfigured({ ...empty("m1"), platform: "p-vrchat" })).toBe(true);
    expect(isMetadataConfigured({ ...empty("m1"), world })).toBe(true);
    expect(isMetadataConfigured({ ...empty("m1"), users: [{ id: "u-1" }] })).toBe(true);
    expect(isMetadataConfigured({ ...empty("m1"), reference: [pin] })).toBe(true);
    expect(isMetadataConfigured({ ...empty("m1"), privacyMetadata: true })).toBe(true);
  });
});

describe("applyToAll", () => {
  it("privacyMetadata だけを全写真にコピーし、他の項目と元配列は変えない", () => {
    const items: EditableMediaMetadata[] = [
      { ...empty("m1"), platform: "p-vrchat" },
      { ...empty("m2"), privacyMetadata: true },
      {
        ...empty("m3"),
        world: { platformIdentifier: "wrld_1", platform: "p-vrchat", name: "Home", author: null },
        reference: [{ x: 0, y: 0, type: "avatar", name: "Avatar" }],
      },
    ];
    const snapshot = structuredClone(items);

    const result = applyToAll(items, 1, "privacyMetadata");

    expect(result.map((item) => item.privacyMetadata)).toEqual([true, true, true]);
    expect(result.map(({ privacyMetadata: _privacyMetadata, ...rest }) => rest)).toEqual(
      snapshot.map(({ privacyMetadata: _privacyMetadata, ...rest }) => rest),
    );
    expect(items).toEqual(snapshot);
  });
});

describe("isMetadataDirty", () => {
  it("同じ内容なら false、privacyMetadata が変われば true", () => {
    const initial = [empty("m1"), empty("m2")];

    expect(isMetadataDirty(initial, [empty("m1"), empty("m2")])).toBe(false);
    expect(isMetadataDirty(initial, [empty("m1"), { ...empty("m2"), privacyMetadata: true }])).toBe(true);
  });
});

const worldHome: EditableWorld = {
  id: "w-1",
  platformIdentifier: "wrld_1",
  platform: "p-vrchat",
  name: "Home",
  author: null,
};
const worldLab: EditableWorld = {
  id: "w-2",
  platformIdentifier: "R-1",
  platform: "p-resonite",
  name: "Lab",
  author: null,
};
const pin = { x: 0.5, y: 0.5, type: "avatar" as const, name: "Avatar", reference: "i-1", order: 0 };
const users = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}` }));

describe("setPlatform", () => {
  const item: EditableMediaMetadata = { ...empty("m1"), platform: "p-vrchat", world: worldHome };

  it("違うプラットフォームならワールドを消す", () => {
    const result = setPlatform(item, "p-resonite");

    expect(result.platform).toBe("p-resonite");
    expect(result.world).toBeUndefined();
  });

  it("同じプラットフォームならワールドを残す", () => {
    expect(setPlatform(item, "p-vrchat").world).toEqual(worldHome);
  });

  it("undefined ならプラットフォームとワールドを消す", () => {
    const result = setPlatform(item, undefined);

    expect(result.platform).toBeUndefined();
    expect(result.world).toBeUndefined();
  });

  it("reference と privacyMetadata は変えない", () => {
    const result = setPlatform({ ...item, reference: [pin], privacyMetadata: true }, "p-resonite");

    expect(result.reference).toEqual([pin]);
    expect(result.privacyMetadata).toBe(true);
  });
});

describe("toEditableWorld", () => {
  it("プラットフォームが無ければ空文字、作者も送信形式にする", () => {
    expect(
      toEditableWorld({
        id: "w-1",
        platformIdentifier: "wrld_1",
        platformOwnerIdentifier: null,
        platform: null,
        name: "Home",
        author: { ...author, platform: null },
      }),
    ).toEqual({
      id: "w-1",
      platformIdentifier: "wrld_1",
      platform: "",
      name: "Home",
      author: { id: "a-1", platformIdentifier: "usr_1", platform: "", name: "Author" },
    });
  });

  it("作者が無ければ null", () => {
    expect(
      toEditableWorld({
        id: "w-1",
        platformIdentifier: "wrld_1",
        platformOwnerIdentifier: null,
        platform: platformObj,
        name: "Home",
        author: null,
      }).author,
    ).toBeNull();
  });
});

describe("toggleUser", () => {
  it("含まれていなければ追加する", () => {
    expect(toggleUser([{ id: "u1" }], "u2")).toEqual({ users: [{ id: "u1" }, { id: "u2" }], limited: false });
  });

  it("含まれていれば外す", () => {
    expect(toggleUser([{ id: "u1" }, { id: "u2" }], "u1")).toEqual({ users: [{ id: "u2" }], limited: false });
  });

  it("10 人目までは追加できる", () => {
    const result = toggleUser(users(MAX_USERS - 1), "u-new");

    expect(result.users).toHaveLength(MAX_USERS);
    expect(result.limited).toBe(false);
  });

  it("11 人目は追加しない", () => {
    const current = users(MAX_USERS);
    const result = toggleUser(current, "u-new");

    expect(result.users).toEqual(current);
    expect(result.limited).toBe(true);
  });

  it("上限に達していても外せる", () => {
    const result = toggleUser(users(MAX_USERS), "u1");

    expect(result.users).toHaveLength(MAX_USERS - 1);
    expect(result.limited).toBe(false);
  });
});

describe("collectUserProfiles", () => {
  it("全写真のユーザーから重複なく表示用の情報を作る", () => {
    const u1 = {
      id: "u1",
      screenName: "one",
      displayName: "One",
      profile: {
        iconUrl: "https://cdn.natsuneko.com/icons/1",
        bannerUrl: "",
        bio: "",
        website: "",
        additionalWebsites: [],
      },
    };
    const u2 = { id: "u2", screenName: "two", displayName: "Two", profile: null };

    expect(collectUserProfiles({ m1: responseItem({ users: [u1] }), m2: responseItem({ users: [u1, u2] }) })).toEqual({
      // アイコンは元画像のままでは表示できないので、CDN のアイコン用の URL にする
      u1: { displayName: "One", screenName: "one", iconUrl: "https://cdn.natsuneko.com/icons/1/tiny" },
      u2: { displayName: "Two", screenName: "two", iconUrl: null },
    });
  });
});

describe("applyToAll (Phase 2)", () => {
  const items: EditableMediaMetadata[] = [
    { ...empty("m1"), platform: "p-vrchat", world: worldHome, users: [{ id: "u1" }], reference: [pin] },
    { ...empty("m2"), platform: "p-resonite", world: worldLab, users: [{ id: "u2" }], privacyMetadata: true },
    { ...empty("m3") },
  ];

  it("platformAndWorld は platform と world を組でコピーし、他の項目は変えない", () => {
    const result = applyToAll(items, 1, "platformAndWorld");

    expect(result.map((item) => item.platform)).toEqual(["p-resonite", "p-resonite", "p-resonite"]);
    expect(result.map((item) => item.world)).toEqual([worldLab, worldLab, worldLab]);
    expect(result.map((item) => [item.users, item.reference, item.privacyMetadata])).toEqual(
      items.map((item) => [item.users, item.reference, item.privacyMetadata]),
    );
  });

  it("コピー元にワールドが無ければ全写真のワールドを消す", () => {
    const result = applyToAll([{ ...empty("m0"), platform: "p-vrchat" }, ...items], 0, "platformAndWorld");

    expect(result.every((item) => item.platform === "p-vrchat" && item.world === undefined)).toBe(true);
  });

  it("users は users だけをコピーする", () => {
    const result = applyToAll(items, 0, "users");

    expect(result.map((item) => item.users)).toEqual([[{ id: "u1" }], [{ id: "u1" }], [{ id: "u1" }]]);
    expect(result.map((item) => [item.platform, item.world, item.reference])).toEqual(
      items.map((item) => [item.platform, item.world, item.reference]),
    );
  });
});

describe("ワールドの差し替え (往復)", () => {
  it("ワールドを差し替えてもピンは落ちない", () => {
    const pins = [
      { ...pin, description: "", externalUrl: null, imageUrl: null, author, order: 0, reference: "i-1" },
      {
        ...pin,
        description: "d",
        externalUrl: "https://booth.pm/ja/items/1",
        imageUrl: "x",
        author,
        order: 1,
        reference: "i-2",
      },
    ];
    const [item] = toEditableMetadata(
      [{ id: "m1" }],
      { m1: responseItem({ platform: "VRChat", reference: pins }) },
      platforms,
    );

    const replaced = {
      ...item,
      world: toEditableWorld({
        id: "w-9",
        platformIdentifier: "wrld_9",
        platformOwnerIdentifier: null,
        platform: platformObj,
        name: "Other",
        author: null,
      }),
    };

    expect(replaced.reference).toHaveLength(2);
    expect(replaced.reference).toEqual(item.reference);
  });
});
