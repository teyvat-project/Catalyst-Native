import { getAuthorIdPlaceholder, getWorldIdPlaceholder } from "./placeholders";

const platform = (name: string) => ({ id: name, name, description: "", url: null, startAt: null });

describe("getWorldIdPlaceholder", () => {
  it("プラットフォームごとの例を返す", () => {
    expect(getWorldIdPlaceholder(platform("cluster"))).toBe(
      "https://cluster.mu/w/20d14291-1d6b-4ad9-9f4e-fe8b87dd6f0c",
    );
    expect(getWorldIdPlaceholder(platform("Resonite"))).toBe(
      "https://go.resonite.com/world/U-esnya/R-3acf68b3-b78b-4a8c-96ef-97a2f744602f",
    );
    expect(getWorldIdPlaceholder(platform("XRift"))).toBe(
      "https://app.xrift.net/world/cdd3397c-7749-45a1-bdb4-c958cc9f1237",
    );
  });

  it("知らないプラットフォームでは VRChat の例を返す", () => {
    expect(getWorldIdPlaceholder(platform("Unknown"))).toBe("wrld_a5e9ec13-36b1-4e63-ae0c-dab9023401f9");
  });
});

describe("getAuthorIdPlaceholder", () => {
  it("プラットフォームなしなら BOOTH のショップ URL の例を返す", () => {
    expect(getAuthorIdPlaceholder(undefined)).toBe("https://your-shop.booth.pm/");
  });

  it("プラットフォームごとの例を返し、知らなければ VRChat の例を返す", () => {
    expect(getAuthorIdPlaceholder(platform("Resonite"))).toBe("U-esnya");
    expect(getAuthorIdPlaceholder(platform("XRift"))).toBe(
      "https://app.xrift.net/user/abe6ebca-b060-4d09-82c1-224e3a0ea77c",
    );
    expect(getAuthorIdPlaceholder(platform("Unknown"))).toBe("usr_f0ae733a-b3ea-4462-b9a7-8c386e860ac1");
  });
});
