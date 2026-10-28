import type { EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";

import type { EditableMediaMetadata } from "./epiclese-metadata-editor";
import {
  addPin,
  applyItem,
  findInvalidPinIndex,
  getContentRect,
  isPinUntouched,
  MAX_PINS,
  movePinDown,
  movePinUp,
  normalizePins,
  removePin,
  setPins,
  toDisplayPoint,
  toNormalizedPoint,
  updateNewItem,
  type EditablePin,
} from "./epiclese-pin-editor";

const pinAuthor = { id: "a-1", name: "Author", platformIdentifier: "usr_1", platform: "p-vrchat" };
const pin = (overrides: Partial<EditablePin> = {}): EditablePin => ({
  x: 0,
  y: 0,
  order: 0,
  type: "other",
  name: "",
  ...overrides,
});
const pins = (n: number) => Array.from({ length: n }, (_, i) => pin({ order: i, reference: `i-${i}` }));

describe("座標変換", () => {
  const landscape = getContentRect({ width: 400, height: 400 }, { width: 2000, height: 1000 });
  const portrait = getContentRect({ width: 400, height: 400 }, { width: 1000, height: 2000 });

  it("横長の写真は上下の余白を除いた矩形になる", () => {
    expect(landscape).toEqual({ x: 0, y: 100, width: 400, height: 200 });
    expect(toNormalizedPoint(landscape, { x: 200, y: 200 })).toEqual({ x: 5000, y: 5000, inBounds: true });
    expect(toNormalizedPoint(landscape, { x: 200, y: 50 }).inBounds).toBe(false);
  });

  it("縦長の写真は左右の余白を除いた矩形になる", () => {
    expect(portrait).toEqual({ x: 100, y: 0, width: 200, height: 400 });
    expect(toNormalizedPoint(portrait, { x: 50, y: 200 }).inBounds).toBe(false);
    expect(toNormalizedPoint(portrait, { x: 300, y: 400 })).toEqual({ x: 10000, y: 10000, inBounds: true });
  });

  it("結果は整数で 0〜10000 に収まる", () => {
    const inside = toNormalizedPoint(landscape, { x: 133.3, y: 177.7 });
    expect(Number.isInteger(inside.x) && Number.isInteger(inside.y)).toBe(true);

    const outside = toNormalizedPoint(landscape, { x: -10, y: 999 });
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(10000);
  });

  it("正規化座標から表示位置に戻せる", () => {
    expect(toDisplayPoint(landscape, { x: 5000, y: 0 })).toEqual({ left: 200, top: 100 });
  });
});

describe("ピンの追加・削除・並べ替え", () => {
  it("末尾に新しいピンを足す", () => {
    expect(addPin(pins(1), { x: 10, y: 20 })).toEqual({
      pins: [...pins(1), { x: 10, y: 20, order: 1, type: "other", name: "" }],
      limited: false,
    });
  });

  it("20 件あれば追加しない", () => {
    const current = pins(MAX_PINS);
    expect(addPin(current, { x: 0, y: 0 })).toEqual({ pins: current, limited: true });
  });

  it("削除すると order を 0 から振り直す", () => {
    expect(removePin(pins(3), 1).map((item) => [item.reference, item.order])).toEqual([
      ["i-0", 0],
      ["i-2", 1],
    ]);
  });

  it("上へ・下へで入れ替え、order を振り直す", () => {
    expect(movePinUp(pins(3), 2).map((item) => [item.reference, item.order])).toEqual([
      ["i-0", 0],
      ["i-2", 1],
      ["i-1", 2],
    ]);
    expect(movePinDown(pins(3), 0).map((item) => item.reference)).toEqual(["i-1", "i-0", "i-2"]);
  });

  it("先頭の上へ・末尾の下へは何もしない", () => {
    expect(movePinUp(pins(3), 0)).toEqual(pins(3));
    expect(movePinDown(pins(3), 2)).toEqual(pins(3));
  });
});

describe("アイテム", () => {
  const item: EpicleseItemResponse = {
    id: "i-1",
    type: "cloth",
    name: "Jacket",
    description: "",
    externalUrl: null,
    imageUrl: null,
    author: { id: "a-1", platformIdentifier: "usr_1", platform: null, name: "Author" },
  };

  it("既存アイテムを選ぶと reference と表示用の値が入り、作者は外れる", () => {
    const result = applyItem(pin({ x: 1, y: 2, order: 3, author: pinAuthor, name: "old" }), item);

    expect(result).toEqual({ x: 1, y: 2, order: 3, reference: "i-1", type: "cloth", name: "Jacket" });
    expect(result.author).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.externalUrl).toBeUndefined();
  });

  it("新規作成の入力を変えると reference が外れ、空文字は undefined にする", () => {
    const result = updateNewItem(pin({ reference: "i-1", externalUrl: "https://example.com" }), {
      name: "X",
      externalUrl: "",
    });

    expect(result.reference).toBeUndefined();
    expect(result.name).toBe("X");
    expect(result.externalUrl).toBeUndefined();
  });
});

describe("isPinUntouched", () => {
  it("何も入っていなければ true (名前が空白だけでも)", () => {
    expect(isPinUntouched(pin())).toBe(true);
    expect(isPinUntouched(pin({ name: "  " }))).toBe(true);
  });

  it("どれか 1 つでも入っていれば false", () => {
    expect(isPinUntouched(pin({ name: "X" }))).toBe(false);
    expect(isPinUntouched(pin({ author: pinAuthor }))).toBe(false);
    expect(isPinUntouched(pin({ externalUrl: "https://example.com" }))).toBe(false);
    expect(isPinUntouched(pin({ description: "d" }))).toBe(false);
    expect(isPinUntouched(pin({ reference: "i-1" }))).toBe(false);
  });
});

describe("findInvalidPinIndex", () => {
  const valid = pin({ name: "X", author: pinAuthor });

  it("すべて有効なら -1", () => {
    expect(findInvalidPinIndex(pins(3))).toBe(-1);
    expect(findInvalidPinIndex([valid, pin({ ...valid, externalUrl: "https://booth.pm/ja/items/1" })])).toBe(-1);
  });

  it("reference があれば名前が空でも有効", () => {
    expect(findInvalidPinIndex([pin({ reference: "i-1" })])).toBe(-1);
  });

  it("最初の無効なピンの添字を返す", () => {
    expect(findInvalidPinIndex([valid, pin({ author: pinAuthor })])).toBe(1);
  });

  it("作者なし・不正な URL・長すぎる説明や名前は無効", () => {
    expect(findInvalidPinIndex([pin({ name: "X" })])).toBe(0);
    expect(findInvalidPinIndex([{ ...valid, externalUrl: "booth.pm/1" }])).toBe(0);
    expect(findInvalidPinIndex([{ ...valid, description: "a".repeat(1025) }])).toBe(0);
    expect(findInvalidPinIndex([{ ...valid, name: "a".repeat(129) }])).toBe(0);
  });
});

describe("setPins", () => {
  it("reference だけを差し替え、他の項目は変えない (往復)", () => {
    const item: EditableMediaMetadata = {
      id: "m1",
      platform: "p-vrchat",
      world: { platformIdentifier: "wrld_1", platform: "p-vrchat", name: "Home", author: null },
      users: [{ id: "u1" }],
      reference: [],
      privacyMetadata: true,
    };

    const result = setPins(item, pins(2));

    expect(result.reference).toEqual(pins(2));
    expect([result.platform, result.world, result.users, result.privacyMetadata]).toEqual([
      item.platform,
      item.world,
      item.users,
      item.privacyMetadata,
    ]);
  });
});

describe("URL の扱い", () => {
  // 入力中に毎回落とすと単語の区切りの空白まで打てなくなるので、確定時にまとめて落とす
  it("確定時に名前と URL の前後の空白を落とし、空になった URL は外す", () => {
    const [result, emptied] = normalizePins([
      pin({ name: " Jacket ", externalUrl: " https://booth.pm/ja/items/1 " }),
      pin({ name: "X", externalUrl: "  " }),
    ]);

    expect(result.name).toBe("Jacket");
    expect(result.externalUrl).toBe("https://booth.pm/ja/items/1");
    expect(emptied.externalUrl).toBeUndefined();
  });

  it("ホスト部分が URL として不正なら無効", () => {
    const valid = pin({ name: "X", author: pinAuthor });

    expect(findInvalidPinIndex([{ ...valid, externalUrl: "https://%zz" }])).toBe(0);
    expect(findInvalidPinIndex([{ ...valid, externalUrl: "https://[" }])).toBe(0);
    expect(findInvalidPinIndex([{ ...valid, externalUrl: "https://example.com/a?b=c#d" }])).toBe(-1);
  });
});
