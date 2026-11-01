import { getWorldSite } from "./world-site";

const XRIFT_ID = "cdd3397c-7749-45a1-bdb4-c958cc9f1237";

describe("getWorldSite", () => {
  it("VRChat のワールドは ID の形で見分ける", () => {
    const site = getWorldSite(null, "wrld_1");

    expect(site?.platformName).toBe("VRChat");
    expect(site?.url).toBe("https://vrchat.com/home/world/wrld_1");
    expect(site?.thumbnailUrl).toBe("https://miliastra.natsuneko.com/vrchat/v1/worlds/wrld_1/thumbnail?variant=card");
  });

  it("XRift のワールドはプラットフォーム名と UUID で見分ける", () => {
    const site = getWorldSite("XRift", XRIFT_ID);

    expect(site?.platformName).toBe("XRift");
    expect(site?.url).toBe(`https://app.xrift.net/world/${XRIFT_ID}`);
    expect(site?.thumbnailUrl).toBe(
      `https://miliastra.natsuneko.com/xrift/v1/worlds/${XRIFT_ID}/thumbnail?variant=card`,
    );
  });

  // cluster のワールド ID も UUID なので、ID だけで XRift とみなさない
  it("同じ形の ID でも XRift 以外のプラットフォームなら null", () => {
    expect(getWorldSite("cluster", XRIFT_ID)).toBeNull();
    expect(getWorldSite(null, XRIFT_ID)).toBeNull();
  });

  it("XRift でも小文字の UUID でなければ null", () => {
    expect(getWorldSite("XRift", XRIFT_ID.toUpperCase())).toBeNull();
    expect(getWorldSite("XRift", "")).toBeNull();
  });

  describe("fetchAuthorName", () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      global.fetch = fetchMock;
    });

    it("XRift はワールドの owner の表示名を返す", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ owner: { displayName: "Alice" } }) });

      await expect(getWorldSite("XRift", XRIFT_ID)?.fetchAuthorName()).resolves.toBe("Alice");
      expect(fetchMock).toHaveBeenCalledWith(`https://miliastra.natsuneko.com/xrift/v1/worlds/${XRIFT_ID}`, {
        signal: undefined,
      });
    });

    it("XRift で owner が無い・見つからない・通信に失敗したときは null", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ owner: null }) });
      fetchMock.mockResolvedValueOnce({ ok: false });
      fetchMock.mockRejectedValueOnce(new Error("network"));
      const site = getWorldSite("XRift", XRIFT_ID);

      await expect(site?.fetchAuthorName()).resolves.toBeNull();
      await expect(site?.fetchAuthorName()).resolves.toBeNull();
      await expect(site?.fetchAuthorName()).resolves.toBeNull();
    });

    it("VRChat は authorName を返す", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ authorName: "Bob" }) });

      await expect(getWorldSite(null, "wrld_1")?.fetchAuthorName()).resolves.toBe("Bob");
    });
  });
});
