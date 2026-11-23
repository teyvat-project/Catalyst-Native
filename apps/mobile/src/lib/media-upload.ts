import type { Catalyst } from "@natsuneko-laboratory/catalyst-sdk";

// POST /media/v2/upload が受け付ける形式。Web 版の投稿欄と同じ
export type UploadImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export const UNSUPPORTED_IMAGE_MESSAGE = "PNG・JPEG・GIF・WebP の画像のみアップロードできます";

// 対応していない形式 (HEIF など) の画像をアップロードしようとしたときに投げる
export class UnsupportedImageError extends Error {
  constructor() {
    super(UNSUPPORTED_IMAGE_MESSAGE);
    this.name = "UnsupportedImageError";
  }
}

const startsWith = (head: Uint8Array, signature: number[], offset = 0) =>
  head.length >= offset + signature.length && signature.every((b, i) => head[offset + i] === b);

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// 先頭バイトのシグネチャから画像の形式を判定する。対応していない形式なら null
// (端末やピッカーによって MIME が取れなかったり拡張子と中身が違ったりするので、中身で決める)
export const detectUploadImageType = (head: Uint8Array): UploadImageType | null => {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return "image/gif";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "image/webp";
  return null;
};

// 画像を Catalyst のストレージにアップロードし、投稿などに渡す URL を返す。
// 署名付き URL は Content-Type と Content-Length を含めて発行されるので、PUT でも同じ値を送る
export const uploadImage = async (client: Catalyst, data: ArrayBuffer): Promise<string> => {
  const contentType = detectUploadImageType(new Uint8Array(data, 0, Math.min(12, data.byteLength)));
  if (!contentType) {
    throw new UnsupportedImageError();
  }

  const { data: urls } = await client.media.v2.upload.create({
    body: { contentType, contentLength: data.byteLength },
    throwOnError: true,
  });

  const res = await fetch(urls.signedUrl, {
    method: "PUT",
    body: data,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  return urls.url;
};
