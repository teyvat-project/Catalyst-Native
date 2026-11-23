import { detectUploadImageType, uploadImage, UnsupportedImageError } from "./media-upload";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, "IHDR");

describe("detectUploadImageType", () => {
  it.each([
    ["image/png", PNG],
    ["image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0x10, "Exif", 0)],
    ["image/gif", bytes("GIF89a", 1, 0, 1, 0, 0, 0)],
    ["image/webp", bytes("RIFF", 0x24, 0, 0, 0, "WEBP")],
  ])("%s の先頭バイトを判定する", (expected, head) => {
    expect(detectUploadImageType(head)).toBe(expected);
  });

  it.each([
    ["HEIF", bytes(0, 0, 0, 0x18, "ftypheic")],
    ["途中で切れた PNG", bytes(0x89, "PNG")],
    ["空", bytes()],
  ])("%s は null を返す", (_, head) => {
    expect(detectUploadImageType(head)).toBeNull();
  });
});

describe("uploadImage", () => {
  const create = jest.fn();
  const client = { media: { v2: { upload: { create } } } } as unknown as Parameters<typeof uploadImage>[0];
  const fetchMock = jest.fn();

  beforeEach(() => {
    create.mockReset().mockResolvedValue({
      data: { url: "https://citlali.natsuneko.com/r2/u/k", signedUrl: "https://r2.example/u/k?sig" },
    });
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;
  });

  it("中身から判定した Content-Type と実際のバイト数で URL を発行し、同じ Content-Type で PUT する", async () => {
    const data = PNG.buffer.slice(0);

    const url = await uploadImage(client, data);

    expect(url).toBe("https://citlali.natsuneko.com/r2/u/k");
    expect(create).toHaveBeenCalledWith({
      body: { contentType: "image/png", contentLength: PNG.byteLength },
      throwOnError: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://r2.example/u/k?sig", {
      method: "PUT",
      body: data,
      headers: { "Content-Type": "image/png" },
    });
  });

  it("対応していない形式なら URL を発行せずに UnsupportedImageError を投げる", async () => {
    await expect(uploadImage(client, bytes(0, 0, 0, 0x18, "ftypheic").buffer)).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("PUT が拒否されたらエラーを投げる", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(uploadImage(client, PNG.buffer.slice(0))).rejects.toThrow("Upload failed: 403");
  });
});
