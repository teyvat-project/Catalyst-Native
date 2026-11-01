import twtr from "twitter-text";

const TWITTER_URL_LENGTH = 23;
const TWEET_MAX_LENGTH = 280;
const ELLIPSIS = "...";

// Web 版の SITE_NAME と同じ表記。X などに流したときに Web からの共有と見た目が揃うようにしている
// (Web 版には SITE_NAME_SHORT = "Catalyst" もあるが、共有テキストでは使われていない)
const SITE_NAME = "Catalyst - VR-SNS 向け写真共有サービス";

// 本文の後ろに必ず付く " | " と、URL の前の改行のぶん
const SEPARATOR_LENGTH = " | ".length + "\n".length;

// twitter-text の重み付き文字数カウントに基づいてスライスするヘルパー
// 全角文字（日本語など）は2としてカウントされるため、raw インデックスで
// スライスすると文字数が超過する
const sliceByTweetLength = (text: string, maxWeightedLength: number): string => {
  let weightedLen = 0;
  for (let i = 0; i < text.length; i++) {
    const charWeight = twtr.getTweetLength(text[i]);
    if (weightedLen + charWeight > maxWeightedLength) {
      return text.slice(0, i);
    }
    weightedLen += charWeight;
  }
  return text;
};

/**
 * 共有先へ流すテキストを組み立てる。組み立て方は Web 版の `buildShareText` に合わせてある。
 *
 * ```
 * 本文[ by 投稿者] | サイト名
 * URL
 * ```
 */
export const buildShareText = (text: string, username: string, url: string): string => {
  // Web 版は投稿者が取れないときは " by ..." ごと省略する
  const author = username ? ` by ${username}` : "";
  const reserved = twtr.getTweetLength(author) + twtr.getTweetLength(SITE_NAME) + TWITTER_URL_LENGTH + SEPARATOR_LENGTH;

  const body =
    twtr.getTweetLength(text) + reserved <= TWEET_MAX_LENGTH
      ? text
      : `${sliceByTweetLength(text, TWEET_MAX_LENGTH - reserved - twtr.getTweetLength(ELLIPSIS))}${ELLIPSIS}`;

  return `${body}${author} | ${SITE_NAME}\n${url}`;
};

export type ShareWorld = {
  name: string;
  /** ワールド制作者。取れなかったときは null */
  author: string | null;
  /** 2 枚目以降に写っている、このワールド以外のワールドの数 */
  otherWorldCount: number;
};

// 自分のツイートにぶら下げて撮影ワールドを紹介する用途なので、Web 版とは揃えず読みやすさを優先して行を分ける。
// 投稿者は「〇〇 さんの投稿を」として誘導の行に入れ、ワールド制作者は Created by で書き分ける。
// Catalyst を知らない人にもリンク先が分かるよう、サービス名には肩書きを添える
const CATALYST_LABEL = "VR 写真共有サービス Catalyst で見る";

// X に流したとき、本文や表示名、ワールド名に含まれる `@xxx` が、同じ ID の X ユーザーへのメンションにならないようにする。
// 全角の `＠` や直前が日本語の `@` もメンションになるので、置き換えでは防げない。そこで twitter-text が
// メンションと判定した `@` の直後にだけ、見えない文字の U+2060 (WORD JOINER) を挟む。メールアドレスなどには入れない
const WORD_JOINER = "\u2060";

const preventMentions = (text: string): string =>
  // 後ろから挟んでいけば、まだ処理していない前の位置はずれない
  twtr
    .extractMentionsWithIndices(text)
    .reduceRight(
      (result, { indices: [start] }) => `${result.slice(0, start + 1)}${WORD_JOINER}${result.slice(start + 1)}`,
      text,
    );

/**
 * 撮影ワールドを添えた共有テキストを組み立てる。
 *
 * ```
 * 本文
 * 🌐 ワールド名 (Created by 制作者) ほか N ワールド
 * 📷 投稿者 さんの投稿を VR 写真共有サービス Catalyst で見る
 * URL
 * ```
 *
 * 本文が無ければ 1 行目ごと、制作者が無ければ「(Created by 制作者)」を、ほかのワールドが無ければ
 * 「ほか N ワールド」を、投稿者が無ければ「投稿者 さんの投稿を」を省く。
 * `buildShareText` と違い、280 文字を超えても切り詰めない (ワールド情報を載せるときは超えてもよい、という方針)。
 * メンションになる `@` には U+2060 を挟む (preventMentions)。
 */
export const buildWorldShareText = (text: string, username: string, url: string, world: ShareWorld): string => {
  const author = world.author ? ` (Created by ${world.author})` : "";
  const others = world.otherWorldCount > 0 ? ` ほか ${world.otherWorldCount} ワールド` : "";
  const linkLine = `📷 ${username ? `${username} さんの投稿を ` : ""}${CATALYST_LABEL}`;

  return preventMentions([text, `🌐 ${world.name}${author}${others}`, linkLine, url].filter(Boolean).join("\n"));
};
