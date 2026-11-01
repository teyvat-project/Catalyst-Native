import twtr from "twitter-text";
import { buildShareText, buildWorldShareText } from "./share";

const URL = "https://catalyst.natsuneko.com/status/123";
const SITE_NAME = "Catalyst - VR-SNS 向け写真共有サービス";

describe("buildShareText", () => {
  it("短いテキストはそのまま連結される", () => {
    const result = buildShareText("hello world", "natsuneko", URL);

    expect(result).toBe(`hello world by natsuneko | ${SITE_NAME}\n${URL}`);
  });

  // Web 版から X へ共有したときの実際の出力と一致すること
  it("本文が空でも Web 版と同じ形になる", () => {
    const result = buildShareText("", "natsuneko", URL);

    expect(result).toBe(` by natsuneko | ${SITE_NAME}\n${URL}`);
  });

  it("投稿者が取れないときは by ごと省略する", () => {
    const result = buildShareText("hello", "", URL);

    expect(result).toBe(`hello | ${SITE_NAME}\n${URL}`);
  });

  it("280 文字 (twitter-text 換算) を超えない場合は省略しない", () => {
    const text = "a".repeat(50);
    const result = buildShareText(text, "user", URL);

    expect(result).not.toContain("...");
    expect(result).toBe(`${text} by user | ${SITE_NAME}\n${URL}`);
  });

  it("収まらない長さのテキストは省略記号付きで切り詰める", () => {
    const text = "a".repeat(400);
    const result = buildShareText(text, "natsuneko", URL);

    expect(result).toContain("...");
    expect(result).toContain(`by natsuneko | ${SITE_NAME}`);
    expect(result.endsWith(URL)).toBe(true);
    expect(twtr.getTweetLength(result)).toBeLessThanOrEqual(280);
  });

  it("全角文字を含む長いテキストでも重み付き文字数で切り詰める (raw index ではない)", () => {
    const text = "あ".repeat(200);
    const result = buildShareText(text, "user", URL);

    expect(result).toContain("...");
    expect(twtr.getTweetLength(result)).toBeLessThanOrEqual(280);
  });

  it("ユーザー名が長い場合でも破綻しない", () => {
    const text = "a".repeat(300);
    const result = buildShareText(text, "a".repeat(50), URL);

    expect(twtr.getTweetLength(result)).toBeLessThanOrEqual(280);
  });
});

describe("buildWorldShareText", () => {
  const WORLD = { name: "星映しの湖", author: "Nekopyo", otherWorldCount: 0 };
  const LINK = "📷 VR 写真共有サービス Catalyst で見る";
  const USER_LINK = "📷 27Cobalter さんの投稿を VR 写真共有サービス Catalyst で見る";

  it("本文、ワールド名 (Created by 制作者)、投稿者入りの Catalyst への誘導、URL を行に分ける", () => {
    const result = buildWorldShareText("#Eku3D", "27Cobalter", URL, WORLD);

    expect(result).toBe(`#Eku3D\n🌐 星映しの湖 (Created by Nekopyo)\n${USER_LINK}\n${URL}`);
  });

  it("制作者が取れないときはワールド名だけにする", () => {
    const result = buildWorldShareText("#Eku3D", "27Cobalter", URL, { ...WORLD, author: null });

    expect(result).toBe(`#Eku3D\n🌐 星映しの湖\n${USER_LINK}\n${URL}`);
  });

  it("2 枚目以降にほかのワールドがあれば「ほか N ワールド」を添える", () => {
    const result = buildWorldShareText("#Eku3D", "27Cobalter", URL, { ...WORLD, otherWorldCount: 2 });

    expect(result).toBe(`#Eku3D\n🌐 星映しの湖 (Created by Nekopyo) ほか 2 ワールド\n${USER_LINK}\n${URL}`);
  });

  it("制作者が取れなくても「ほか N ワールド」は添える", () => {
    const result = buildWorldShareText("#Eku3D", "27Cobalter", URL, { ...WORLD, author: null, otherWorldCount: 1 });

    expect(result).toBe(`#Eku3D\n🌐 星映しの湖 ほか 1 ワールド\n${USER_LINK}\n${URL}`);
  });

  it("投稿者が無いときは誘導の行から投稿者を省く", () => {
    const result = buildWorldShareText("#Eku3D", "", URL, WORLD);

    expect(result).toBe(`#Eku3D\n🌐 星映しの湖 (Created by Nekopyo)\n${LINK}\n${URL}`);
  });

  it("本文が無いときは 1 行目ごと省く", () => {
    const result = buildWorldShareText("", "27Cobalter", URL, WORLD);

    expect(result).toBe(`🌐 星映しの湖 (Created by Nekopyo)\n${USER_LINK}\n${URL}`);
  });

  it("280 文字 (twitter-text 換算) を超えても本文を切り詰めない", () => {
    const text = "あ".repeat(200);
    const result = buildWorldShareText(text, "27Cobalter", URL, WORLD);

    expect(result).toBe(`${text}\n🌐 星映しの湖 (Created by Nekopyo)\n${USER_LINK}\n${URL}`);
    expect(twtr.getTweetLength(result)).toBeGreaterThan(280);
  });

  describe("メンションにならないようにする", () => {
    const WJ = "\u2060";

    it("表示名の @xxx は @ の直後に U+2060 を挟む", () => {
      const result = buildWorldShareText("", "コバルト@foo", URL, WORLD);

      expect(result).toContain(`📷 コバルト@${WJ}foo さんの投稿を`);
      expect(twtr.extractMentions(result)).toEqual([]);
    });

    it("本文の半角・全角の @xxx にも挟む", () => {
      const result = buildWorldShareText("@foo と ＠bar に感謝", "", URL, WORLD);

      expect(result.split("\n")[0]).toBe(`@${WJ}foo と ＠${WJ}bar に感謝`);
      expect(twtr.extractMentions(result)).toEqual([]);
    });

    it("メンションにならない @ (メールアドレスなど) には挟まない", () => {
      const result = buildWorldShareText("連絡は foo@example.com まで", "", URL, WORLD);

      expect(result).not.toContain(WJ);
    });
  });
});
