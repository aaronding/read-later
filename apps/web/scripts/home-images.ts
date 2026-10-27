// Takes the screenshots on the homepage: the Inbox on a computer and an
// article on a phone, in each interface language, light and dark, from the
// real app. Then it takes the homepage itself, the image a link to the site
// shows when shared, and the Chrome Web Store's screenshots. Run it after
// changing how those pages look, and commit what it writes to public/home,
// src/app/opengraph-image.png and apps/extension/store:
//
//   pnpm build && pnpm start          (in another terminal)
//   pnpm --filter web home-images
//
// It signs in as a demo account it creates in DATABASE_URL, with a few made-up
// articles, so point DATABASE_URL at a local or branch database, never the
// real one. It drives the Chrome installed on this computer, or the browser at
// CHROMIUM_PATH.
import "../src/config/load-env";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { appUrl, requireEnv } from "../src/config/env";
import { getDb } from "../src/db";
import { articles, sessions, summaries, userAppearance, users } from "../src/db/schema";
import { LOCALES, type AppLocale } from "../src/i18n/locales";

const USER_ID = "home-images-demo";
const TOKEN = "home-images-demo-session";
const OUT = new URL("../public/home/", import.meta.url);
const STORE = new URL("../../extension/store/", import.meta.url);
const SHARE_IMAGE = new URL("../src/app/opengraph-image.png", import.meta.url);

interface DemoArticle {
  lang: AppLocale;
  title: string;
  siteName: string;
  author: string;
  minutes: number;
  paragraphs: string[];
  tldr: string;
  keyPoints: string[];
}

// Made up, in the four languages. Each interface language shows its own on the phone.
const ARTICLES: DemoArticle[] = [
  {
    lang: "en",
    title: "Why cities are planting orchards in public parks",
    siteName: "Greenway Journal",
    author: "Maya Ellison",
    minutes: 6,
    paragraphs: [
      "On a Saturday morning in late September, a dozen volunteers gathered under the pear trees at the edge of Riverside Park, ladders in hand. Five years ago the slope was mown grass. Today it is one of more than forty public orchards the city looks after with its neighbors.",
      "The idea is simple: plant fruit trees where people already walk, and let anyone pick the fruit. Parks departments like it for a less romantic reason. A mature orchard costs less to keep than a lawn that has to be mown every week from April to October.",
      "Volunteers prune in winter and harvest in autumn, and the city pays for the trees, the mulch and a part-time coordinator. What the volunteers don’t pick is offered to food banks.",
      "Not everyone is convinced. Fallen fruit draws wasps, and some neighbors worry about ladders on public land. Planners now choose varieties that ripen over several weeks, and put the trees away from playgrounds.",
    ],
    tldr: "Towns are turning lawns into free community orchards that volunteers look after.",
    keyPoints: [
      "Fruit trees cost less to keep than grass that is mown every week.",
      "Volunteers prune and harvest; anyone may pick the fruit.",
      "Planners pick slow-ripening varieties to limit fallen fruit and wasps.",
    ],
  },
  {
    lang: "fr",
    title: "Le grand retour des trains de nuit",
    siteName: "Carnets de voyage",
    author: "Claire Martel",
    minutes: 8,
    paragraphs: [
      "À 21 h 40, le train de nuit pour Vienne quitte la gare de l’Est presque complet. Il y a dix ans, ces lignes disparaissaient une à une ; aujourd’hui, de nouvelles voitures-lits roulent vers Berlin, Vienne et bientôt Barcelone.",
      "Les voyageurs y voient une nuit d’hôtel en moins et une journée de plus sur place. Les compagnies, elles, misent sur des clients prêts à renoncer à l’avion pour des trajets de moins de mille kilomètres.",
      "Reste le prix : une couchette coûte souvent plus cher qu’un vol à bas prix, et les places se vendent vite pendant les vacances.",
      "Plusieurs pays ont promis de nouveaux financements. Les associations d’usagers demandent surtout des horaires fiables et des correspondances garanties.",
    ],
    tldr: "Les trains de nuit reviennent en Europe, portés par des voyageurs qui veulent éviter l’avion.",
    keyPoints: [
      "De nouvelles lignes relient Paris à Vienne et à Berlin.",
      "Une couchette coûte souvent plus cher qu’un vol à bas prix.",
      "Les usagers réclament des horaires fiables et des correspondances garanties.",
    ],
  },
  {
    lang: "zh-Hans",
    title: "城市里的夜间图书馆",
    siteName: "城市周刊",
    author: "林晓",
    minutes: 5,
    paragraphs: [
      "晚上十点，社区图书馆的灯还亮着。下班后的年轻人、备考的学生和睡不着的老人，各自占据一张桌子，安静地读书。",
      "这家图书馆去年开始试行夜间开放，最初只有周五和周六，如今每天开到午夜。管理员说，夜里的读者比白天更专注。",
      "延长开放时间并不便宜：电费、安保和值班人员都要增加预算。区里的做法是招募志愿者，并与附近的书店合作举办夜读活动。",
      "有读者说，这里是城市里少有的、不需要消费就能久坐的地方。",
    ],
    tldr: "一些城市的社区图书馆开始开到深夜，成为下班后读书和自习的去处。",
    keyPoints: ["试行从周末开始，如今每天开到午夜。", "夜间开放增加了电费、安保和人手的成本。", "志愿者和附近书店帮忙分担运营。"],
  },
  {
    lang: "zh-Hant",
    title: "台北老書店的生存之道",
    siteName: "城市散步",
    author: "陳怡君",
    minutes: 7,
    paragraphs: [
      "走進溫州街的巷子，木門後是一間開了四十年的舊書店。書架從地板一路堆到天花板，空氣裡有紙張和咖啡的味道。",
      "第二代店主接手後，把一半的空間改成小講堂，每週舉辦讀書會和作家座談。他說，人們來這裡不只是為了買書，也是為了遇見其他讀者。",
      "網路書店和租金上漲讓許多老店難以為繼。這家店靠著會員制、二手書收購和線上預約，慢慢找到平衡。",
      "店主笑說，最好的推薦還是來自熟客：「他們會告訴我下一本該進什麼書。」",
    ],
    tldr: "台北一間四十年的舊書店，靠讀書會、會員制和二手書收購撐過網路時代。",
    keyPoints: ["第二代店主把一半空間改成講堂。", "會員制和二手書收購帶來穩定收入。", "熟客的推薦決定了進書的方向。"],
  },
  {
    lang: "en",
    title: "The quiet comeback of the paper notebook",
    siteName: "Craft & Mind",
    author: "Daniel Okafor",
    minutes: 4,
    paragraphs: [
      "Sales of paper notebooks have grown for three years in a row, even as almost everything else we write has moved to screens.",
      "Teachers and researchers point to the same thing: writing by hand is slower, and the slowness helps people remember.",
    ],
    tldr: "Paper notebooks are selling again, as people find that writing by hand helps them think.",
    keyPoints: ["Sales have grown three years in a row.", "Writing slowly by hand helps memory."],
  },
];

/** The session cookie as Better Auth signs it: the token, a dot, and its HMAC. */
function sessionCookie(): string {
  const signature = createHmac("sha256", requireEnv("BETTER_AUTH_SECRET")).update(TOKEN).digest("base64");
  return encodeURIComponent(`${TOKEN}.${signature}`);
}

async function seed() {
  const db = getDb();
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({ id: USER_ID, name: "Demo", email: "demo@example.com", emailVerified: true });
  await db.insert(sessions).values({ id: TOKEN, token: TOKEN, userId: USER_ID, expiresAt: new Date(Date.now() + 3600_000) });
  const ids = new Map<AppLocale, string>();
  for (const [index, article] of ARTICLES.entries()) {
    const text = article.paragraphs.join("\n\n");
    const [row] = await db
      .insert(articles)
      .values({
        userId: USER_ID,
        url: `https://example.com/demo-${index}`,
        normalizedUrl: `https://example.com/demo-${index}`,
        status: "ready",
        saveSource: "extension",
        contentSource: "client",
        title: article.title,
        siteName: article.siteName,
        author: article.author,
        lang: article.lang,
        contentHtml: article.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(""),
        textContent: text,
        wordCount: article.minutes * 230,
        readingMinutes: article.minutes,
        summaryModel: "claude-sonnet-5-5",
        favorite: index === 1,
        savedAt: new Date(Date.now() - index * 5 * 3600_000),
      })
      .returning({ id: articles.id });
    await db.insert(summaries).values({
      userId: USER_ID,
      articleId: row!.id,
      model: "claude-sonnet-5-5",
      servedModel: "claude-sonnet-5-5",
      status: "ready",
      language: article.lang,
      tldr: article.tldr,
      keyPoints: article.keyPoints,
      completedAt: new Date(),
    });
    if (!ids.has(article.lang)) ids.set(article.lang, row!.id);
  }
  return ids;
}

async function main() {
  // A demo account in a real database would be a mistake; insist on a local one.
  const host = new URL(requireEnv("DATABASE_URL")).hostname;
  if (!["localhost", "127.0.0.1"].includes(host) && !process.env.HOME_IMAGES_ANY_DATABASE) {
    throw new Error(`DATABASE_URL points at ${host}. Use a local database, or set HOME_IMAGES_ANY_DATABASE=1 for a throwaway branch.`);
  }
  const ids = await seed();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" });
  const db = getDb();
  try {
    for (const scheme of ["light", "dark"] as const) {
      await db.delete(userAppearance).where(eq(userAppearance.userId, USER_ID));
      await db.insert(userAppearance).values({ userId: USER_ID, theme: scheme, lightPalette: "paper", darkPalette: "graphite", font: "classic" });
      for (const locale of LOCALES) {
        await db.update(articles).set({ readAt: null }).where(eq(articles.userId, USER_ID));
        const shoot = async (path: string, viewport: { width: number; height: number }, scale: number, file: string) => {
          const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale, colorScheme: scheme });
          await context.addCookies([{ name: "better-auth.session_token", value: sessionCookie(), url: appUrl() }]);
          const page = await context.newPage();
          await page.goto(`${appUrl()}${path}`, { waitUntil: "networkidle" });
          // The homepage names no AI company or model, so the summary's model is left out.
          await page.addStyleTag({ content: ".summary-model, .translation-meta { visibility: hidden; }" });
          const png = await page.screenshot();
          await sharp(png).webp({ quality: 82 }).toFile(fileURLToPath(new URL(file, OUT)));
          await context.close();
          console.log(`Wrote public/home/${file}`);
        };
        await shoot("/inbox", { width: 960, height: 640 }, 2, `inbox-${locale}-${scheme}.webp`);
        await shoot(`/articles/${ids.get(locale)}`, { width: 375, height: 760 }, 2, `reader-${locale}-${scheme}.webp`);
      }
    }
    // Signed out, in English and light, at the 1200 × 630 Open Graph asks for:
    // whoever fetches a shared link's preview sends no language or theme. Only
    // the name and the hero show, centered in the space under the name.
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, locale: "en", colorScheme: "light" });
    const page = await context.newPage();
    await page.goto(appUrl(), { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `.visitor-preferences, .band, .site-footer { display: none; }
        .shell { display: flex; flex-direction: column; height: 100vh; padding-bottom: 0; }
        .shell main { flex: 1; display: grid; align-content: center; }`,
    });
    await sharp(await page.screenshot()).png({ compressionLevel: 9 }).toFile(fileURLToPath(SHARE_IMAGE));
    await context.close();
    console.log("Wrote src/app/opengraph-image.png");
    // The Chrome Web Store's screenshots, at its 1280 × 800, in English and
    // light: what the extension saves to.
    await db.delete(userAppearance).where(eq(userAppearance.userId, USER_ID));
    await db.insert(userAppearance).values({ userId: USER_ID, theme: "light", lightPalette: "paper", darkPalette: "graphite", font: "classic" });
    await db.update(articles).set({ readAt: null }).where(eq(articles.userId, USER_ID));
    for (const [path, file] of [
      ["/inbox", "screenshot-1-inbox.png"],
      [`/articles/${ids.get("en")}`, "screenshot-2-article.png"],
      ["/triage", "screenshot-3-triage.png"],
    ] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en", colorScheme: "light" });
      await context.addCookies([{ name: "better-auth.session_token", value: sessionCookie(), url: appUrl() }]);
      const page = await context.newPage();
      await page.goto(`${appUrl()}${path}`, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: ".summary-model, .translation-meta { visibility: hidden; }" });
      await sharp(await page.screenshot()).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(file, STORE)));
      await context.close();
      console.log(`Wrote apps/extension/store/${file}`);
    }
  } finally {
    await browser.close();
    await db.delete(users).where(eq(users.id, USER_ID));
  }
  process.exit(0);
}

await main();
