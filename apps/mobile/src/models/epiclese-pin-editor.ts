import type { EpicleseAuthorResponse, EpicleseItemResponse } from "@natsuneko-laboratory/catalyst-sdk";

import type { EditableMediaMetadata } from "./epiclese-metadata-editor";

// 写真上のピン (送信形式)。x, y は元画像に対する 0-10000 の正規化座標 (万分率) で、サーバーは整数しか受け付けない
export type EditablePin = EditableMediaMetadata["reference"][number];

export type ContentRect = { x: number; y: number; width: number; height: number };

// サーバーの METADATA_SCHEMA の上限。超えると保存全体が 400 になる
export const MAX_PINS = 20;
export const PIN_COORDINATE_MAX = 10000;
const MAX_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 1024;

export const ITEM_TYPES = ["avatar", "cloth", "accessory", "hair", "gimmick", "other"] as const;

export const ITEM_TYPE_LABELS: Record<EditablePin["type"], string> = {
  avatar: "アバター",
  cloth: "衣装",
  accessory: "アクセサリー",
  hair: "ヘアー",
  gimmick: "ギミック",
  other: "その他",
};

// contain 表示の写真が箱の中で実際に描画される矩形 (レターボックスを除いた部分)。media-pin-overlay と同じ計算
export const getContentRect = (
  box: { width: number; height: number },
  image: { width: number; height: number },
): ContentRect => {
  const imageRatio = image.width / image.height;
  const boxRatio = box.width / box.height;

  if (imageRatio > boxRatio) {
    const height = box.width / imageRatio;
    return { x: 0, y: (box.height - height) / 2, width: box.width, height };
  }

  const width = box.height * imageRatio;
  return { x: (box.width - width) / 2, y: 0, width, height: box.height };
};

const clampCoordinate = (value: number) => Math.min(PIN_COORDINATE_MAX, Math.max(0, Math.round(value)));

export const toNormalizedPoint = (rect: ContentRect, point: { x: number; y: number }) => {
  const relX = point.x - rect.x;
  const relY = point.y - rect.y;

  return {
    x: clampCoordinate((relX / rect.width) * PIN_COORDINATE_MAX),
    y: clampCoordinate((relY / rect.height) * PIN_COORDINATE_MAX),
    inBounds: relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height,
  };
};

export const toDisplayPoint = (rect: ContentRect, pin: { x: number; y: number }) => ({
  left: rect.x + (pin.x / PIN_COORDINATE_MAX) * rect.width,
  top: rect.y + (pin.y / PIN_COORDINATE_MAX) * rect.height,
});

// 一覧の順番がそのまま表示順 (order) になる
const renumber = (pins: EditablePin[]) => pins.map((pin, order) => ({ ...pin, order }));

export const addPin = (pins: EditablePin[], point: { x: number; y: number }) => {
  if (pins.length >= MAX_PINS) {
    return { pins, limited: true };
  }

  const next: EditablePin = { x: point.x, y: point.y, order: pins.length, type: "other", name: "" };
  return { pins: [...pins, next], limited: false };
};

export const movePin = (pins: EditablePin[], index: number, point: { x: number; y: number }) =>
  pins.map((pin, i) => (i === index ? { ...pin, x: point.x, y: point.y } : pin));

export const removePin = (pins: EditablePin[], index: number) => renumber(pins.filter((_, i) => i !== index));

const swap = (pins: EditablePin[], a: number, b: number) => {
  if (a < 0 || b < 0 || a >= pins.length || b >= pins.length) {
    return pins;
  }

  const next = [...pins];
  [next[a], next[b]] = [next[b], next[a]];
  return renumber(next);
};

export const movePinUp = (pins: EditablePin[], index: number) => swap(pins, index - 1, index);

export const movePinDown = (pins: EditablePin[], index: number) => swap(pins, index, index + 1);

export const applyItem = (pin: EditablePin, item: EpicleseItemResponse): EditablePin => ({
  ...pin,
  reference: item.id,
  type: item.type,
  name: item.name,
  description: item.description || undefined,
  externalUrl: item.externalUrl ?? undefined,
  author: undefined,
});

// 新しいアイテムの入力を変えたら、既存アイテムの選択は外す (Web 版と同じ)
export const updateNewItem = (
  pin: EditablePin,
  patch: Partial<Pick<EditablePin, "type" | "name" | "externalUrl" | "description" | "author">>,
): EditablePin => {
  const next = { ...pin, ...patch, reference: undefined };

  return {
    ...next,
    externalUrl: next.externalUrl || undefined,
    description: next.description || undefined,
  };
};

export const toPinAuthor = (author: EpicleseAuthorResponse): NonNullable<EditablePin["author"]> => ({
  id: author.id,
  name: author.name,
  platformIdentifier: author.platformIdentifier,
  platform: author.platform?.id ?? "",
});

export const isPinUntouched = (pin: EditablePin) =>
  !pin.reference && !pin.author && !pin.externalUrl && !pin.description?.trim() && !pin.name.trim();

// サーバーは zod の url() (WHATWG URL) で確かめる。ホストに使えない文字があると保存全体が失敗するので、ここで止める
const EXTERNAL_URL_PATTERN = /^https?:\/\/[^\s/?#%[\]@]+(?:[/?#]\S*)?$/;

const isValidPin = (pin: EditablePin) => {
  if (pin.reference) {
    return true;
  }

  // 新しいアイテムは保存時にサーバーが作る。作者が無いとサーバーが例外を投げ、保存全体が失敗する
  const name = pin.name.trim();
  return (
    name.length >= 1 &&
    name.length <= MAX_NAME_LENGTH &&
    !!pin.author &&
    (!pin.externalUrl || EXTERNAL_URL_PATTERN.test(pin.externalUrl)) &&
    (pin.description?.length ?? 0) <= MAX_DESCRIPTION_LENGTH
  );
};

export const findInvalidPinIndex = (pins: EditablePin[]) => pins.findIndex((pin) => !isValidPin(pin));

// 入力中に前後の空白を落とすと単語の区切りの空白まで打てなくなるので、「完了」のときにまとめて落とす。
// 貼り付けた URL の末尾の空白で「入力が足りません」になるのを防ぐ
export const normalizePins = (pins: EditablePin[]): EditablePin[] =>
  pins.map((pin) => ({
    ...pin,
    name: pin.name.trim(),
    externalUrl: pin.externalUrl?.trim() || undefined,
  }));

export const setPins = (item: EditableMediaMetadata, pins: EditablePin[]): EditableMediaMetadata => ({
  ...item,
  reference: pins,
});
