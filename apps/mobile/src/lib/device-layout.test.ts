import { columnsFor, headerHeightFor, widthClassFor } from "./device-layout";

describe("columnsFor", () => {
  // 幅: iPhone 402 / Duo 畳 466 / iPad mini 744 / iPad 11" 834 / Duo 開 951 / iPad 13" 1032 / iPad 13" 横 1376
  const widths = [402, 466, 744, 834, 951, 1032, 1376];

  it.each([
    ["投稿", 200, 3, [3, 3, 3, 4, 4, 5, 6]],
    ["メディア", 270, 2, [2, 2, 2, 3, 3, 3, 5]],
    ["リスト", 400, 1, [1, 1, 1, 2, 2, 2, 3]],
  ])("%s の列数が spec の表どおりになる", (_, target, min, expected) => {
    expect(widths.map((w) => columnsFor(w, target as number, min as number))).toEqual(expected);
  });

  it("幅 0 のときは最小列数を返す", () => {
    expect(columnsFor(0, 200, 3)).toBe(3);
  });
});

describe("headerHeightFor", () => {
  it.each([
    [402, 874, 134],
    [466, 678, 466 / 3],
    [951, 669, 669 * 0.3],
    [1032, 1376, 344],
    [1376, 1032, 1032 * 0.3],
  ])("%d×%d の高さは %d", (width, height, expected) => {
    expect(headerHeightFor(width, height)).toBeCloseTo(expected);
  });
});

describe("widthClassFor", () => {
  it("列数に対応する幅のクラスを返す", () => {
    expect([1, 2, 3, 4, 5, 6].map(widthClassFor)).toEqual(["w-full", "w-1/2", "w-1/3", "w-1/4", "w-1/5", "w-1/6"]);
  });

  it("6 列を超えたら w-1/6 を返す", () => {
    expect(widthClassFor(9)).toBe("w-1/6");
  });
});
