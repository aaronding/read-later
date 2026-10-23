import type { AppLocale } from "@/i18n/locales";

// The welcome article every new account starts with, in each interface
// language: a short guide to the app, with a summary written by hand. The
// labels in quotes are the app's own (messages/<language>/), so change them
// here too when they change there. Links to the app's pages are relative.

export interface WelcomeContent {
  title: string;
  /** The article, as HTML. It is sanitized like any saved article before it is stored. */
  html: string;
  tldr: string;
  keyPoints: string[];
}

export const WELCOME_CONTENT: Record<AppLocale, (app: string) => WelcomeContent> = {
  en: (app) => ({
    title: `Welcome to ${app}`,
    tldr: `${app} keeps the articles you want to read later, each with a clean copy and a short summary, and this guide shows how to save, read and organize them.`,
    keyPoints: [
      "Save from the Chrome extension, the Safari Shortcut or Android’s Share menu, or paste a link at the top of the Inbox.",
      "Every article opens with a summary in its own language, which you can translate; the Aa button sets the font and colors.",
      "“Preview only” means the site needs a login or a subscription: open the article signed in and save it again with the extension or the Shortcut.",
      "Triage, Favorites, Archive, folders, tags and search keep your Inbox in order, and Settings exports everything you saved.",
    ],
    html: `
<p>${app} keeps the articles you want to read later. Save a page while you browse, and ${app} keeps its link, a clean copy of the article without the ads and menus around it, and a short summary, so you know what it says before you start. This guide is your first saved article: the summary above it is how every article begins.</p>

<h2>Save an article</h2>
<ul>
<li><strong>On a computer:</strong> use the browser extension for Chrome. In <a href="/settings">Settings</a>, “Save from Chrome” explains how to install it. Create a token under “Access tokens” in Settings and enter it in the extension’s Options. The toolbar button, or Alt+Shift+S (Option+Shift+S on a Mac), then saves the page you are reading, and right-clicking a link offers “Save link to ${app}”.</li>
<li><strong>On an iPhone or iPad:</strong> build the Safari Shortcut once, with the step-by-step instructions in Settings. It then appears when you tap Share in Safari, and it syncs to your Mac too.</li>
<li><strong>On Android:</strong> open ${app} in Chrome, choose Add to Home screen → Install in Chrome’s ⋮ menu, and ${app} appears whenever you tap Share in another app.</li>
<li><strong>Anywhere:</strong> paste a link in the box at the top of the Inbox.</li>
</ul>
<p>A new article shows “Summarizing…” until its summary is ready, usually within half a minute.</p>

<h2>Read and get the gist</h2>
<p>Every article opens with its summary: one sentence that says what it is about, then its key points. The summary is written in the article’s own language. To read it in another one, choose a language under “Translate into” and press “Translate”. Under the summary, suggested tags can be added with one tap.</p>
<p>The <strong>Aa</strong> button at the top of every page sets how articles look: a light or dark theme, its colors, and the font. The choice is saved to your account, so every device you sign in on uses it. “Open original ↗”, under the title, goes to the page as it was published.</p>

<h2>When an article says “Preview only”</h2>
<p>Some sites show their articles only to readers who are signed in or subscribe. When ${app} downloads such a page from a link alone, it gets only the beginning, or a login page, and marks the article “Preview only”. ${app} never gets around a paywall or a login. To keep the full article, open it in your browser, signed in to the site, and save it again with the extension or the Safari Shortcut: they send the page as you see it, and the full copy replaces the preview.</p>

<h2>Keep your Inbox in order</h2>
<ul>
<li><strong>Triage</strong> shows your unread articles one at a time, each with its summary. Choose “Read now”, “Later” to keep it and move it to the back of the queue, or “Archive”.</li>
<li><strong>Favorites</strong> keeps the articles you mark with “Favorite”.</li>
<li><strong>Archive</strong> keeps what you are done with, and “Move to Inbox” brings an article back.</li>
<li><strong>Folders and tags:</strong> put an article in a folder with “Folder”, next to Archive and Favorite, and give it any number of tags under its summary. Each list can then show one folder or tag.</li>
<li><strong>Search</strong>, at the top of each list, looks through titles, summaries and the articles’ text.</li>
</ul>
<p>This guide is an ordinary article too: archive it or delete it whenever you like.</p>

<h2>Your data</h2>
<p>In Settings, “Export” downloads everything you saved, with each article’s text and summaries, as JSON or Markdown. The <a href="/about">About</a> page tells you more about ${app}, and the <a href="/privacy">Privacy</a> page explains what it keeps and why.</p>
`,
  }),

  fr: (app) => ({
    title: `Bienvenue dans ${app}`,
    tldr: `${app} conserve les articles que vous voulez lire plus tard, chacun avec une copie épurée et un court résumé, et ce guide explique comment les enregistrer, les lire et les ranger.`,
    keyPoints: [
      "Enregistrez avec l’extension Chrome, le raccourci Safari ou le menu Partager d’Android, ou collez un lien en haut de la boîte de réception.",
      "Chaque article commence par un résumé dans sa propre langue, que vous pouvez traduire ; le bouton Aa règle la police et les couleurs.",
      "« Aperçu seulement » signifie que le site demande une connexion ou un abonnement : ouvrez l’article en étant connecté et enregistrez-le à nouveau avec l’extension ou le raccourci.",
      "Le triage, les favoris, les archives, les dossiers, les étiquettes et la recherche gardent votre boîte de réception en ordre, et les paramètres exportent tout ce que vous avez enregistré.",
    ],
    html: `
<p>${app} conserve les articles que vous voulez lire plus tard. Enregistrez une page pendant que vous naviguez : ${app} garde son lien, une copie épurée de l’article, sans les publicités ni les menus qui l’entourent, et un court résumé, pour savoir ce qu’il dit avant de commencer. Ce guide est votre premier article enregistré : le résumé qui le précède est la façon dont chaque article commence.</p>

<h2>Enregistrer un article</h2>
<ul>
<li><strong>Sur un ordinateur :</strong> utilisez l’extension de navigateur pour Chrome. Dans les <a href="/settings">Paramètres</a>, « Enregistrer depuis Chrome » explique comment l’installer. Créez un jeton sous « Jetons d’accès » dans les Paramètres et saisissez-le dans les Options de l’extension. Le bouton de la barre d’outils, ou Alt+Maj+S (Option+Maj+S sur Mac), enregistre alors la page que vous lisez, et un clic droit sur un lien propose « Enregistrer le lien dans ${app} ».</li>
<li><strong>Sur un iPhone ou un iPad :</strong> créez une fois le raccourci Safari, en suivant les instructions pas à pas des Paramètres. Il apparaît ensuite quand vous touchez Partager dans Safari, et il se synchronise aussi sur votre Mac.</li>
<li><strong>Sur Android :</strong> ouvrez ${app} dans Chrome, choisissez Ajouter à l’écran d’accueil → Installer dans le menu ⋮ de Chrome, et ${app} apparaît chaque fois que vous appuyez sur Partager dans une autre application.</li>
<li><strong>Partout :</strong> collez un lien dans le champ en haut de la boîte de réception.</li>
</ul>
<p>Un nouvel article affiche « Résumé en cours… » jusqu’à ce que son résumé soit prêt, en général en moins d’une demi-minute.</p>

<h2>Lire et saisir l’essentiel</h2>
<p>Chaque article commence par son résumé : une phrase qui dit de quoi il parle, puis ses points clés. Le résumé est rédigé dans la langue de l’article. Pour le lire dans une autre langue, choisissez-la sous « Traduire en » et appuyez sur « Traduire ». Sous le résumé, des étiquettes suggérées s’ajoutent d’un geste.</p>
<p>Le bouton <strong>Aa</strong>, en haut de chaque page, règle l’apparence des articles : un thème clair ou sombre, ses couleurs et la police. Votre choix est enregistré dans votre compte : tous les appareils sur lesquels vous vous connectez l’utilisent. « Ouvrir l’original ↗ », sous le titre, mène à la page telle qu’elle a été publiée.</p>

<h2>Quand un article indique « Aperçu seulement »</h2>
<p>Certains sites ne montrent leurs articles qu’aux lecteurs connectés ou abonnés. Quand ${app} télécharge une telle page à partir de son seul lien, il n’en obtient que le début, ou une page de connexion, et marque l’article « Aperçu seulement ». ${app} ne contourne jamais un paywall ni une connexion. Pour conserver l’article complet, ouvrez-le dans votre navigateur, en étant connecté au site, et enregistrez-le à nouveau avec l’extension ou le raccourci Safari : ils envoient la page telle que vous la voyez, et la copie complète remplace l’aperçu.</p>

<h2>Garder votre boîte de réception en ordre</h2>
<ul>
<li><strong>Triage</strong> présente vos articles non lus un par un, chacun avec son résumé. Choisissez « Lire maintenant », « Plus tard » pour le garder et le placer à la fin de la file, ou « Archiver ».</li>
<li><strong>Favoris</strong> réunit les articles marqués avec « Ajouter aux favoris ».</li>
<li><strong>Archives</strong> réunit ce que vous avez terminé, et « Remettre dans la boîte de réception » y ramène un article.</li>
<li><strong>Dossiers et étiquettes :</strong> rangez un article dans un dossier avec « Dossier », à côté d’Archiver et des favoris, et donnez-lui autant d’étiquettes que vous voulez sous son résumé. Chaque liste peut ensuite n’afficher qu’un dossier ou une étiquette.</li>
<li><strong>La recherche</strong>, en haut de chaque liste, parcourt les titres, les résumés et le texte des articles.</li>
</ul>
<p>Ce guide est lui aussi un article ordinaire : archivez-le ou supprimez-le quand vous voulez.</p>

<h2>Vos données</h2>
<p>Dans les Paramètres, « Exportation » télécharge tout ce que vous avez enregistré, avec le texte et les résumés de chaque article, au format JSON ou Markdown. La page <a href="/about">À propos</a> présente ${app} plus en détail, et la page <a href="/privacy">Confidentialité</a> explique ce qu’il conserve et pourquoi.</p>
`,
  }),

  "zh-Hans": (app) => ({
    title: `欢迎使用 ${app}`,
    tldr: `${app} 为你保存想稍后阅读的文章，每篇都附有简洁的正文副本和简短摘要；本指南介绍如何保存、阅读和整理文章。`,
    keyPoints: [
      "可以用 Chrome 扩展程序、Safari 快捷指令或 Android 的“分享”菜单保存，也可以在收件箱顶部粘贴链接。",
      "每篇文章都以用原文语言写成的摘要开头，摘要可以翻译；Aa 按钮用于设置字体和配色。",
      "“仅预览”表示网站需要登录或订阅：请在登录状态下打开文章，再用扩展程序或快捷指令重新保存。",
      "整理、收藏、归档、文件夹、标签和搜索帮助你管理收件箱，在“设置”中还可以导出保存的全部内容。",
    ],
    html: `
<p>${app} 为你保存想稍后阅读的文章。浏览网页时保存一个页面，${app} 会保留它的链接、一份去掉了广告和菜单的简洁正文副本，以及一段简短的摘要，让你在开始阅读前就知道文章讲了什么。本指南就是你保存的第一篇文章：上方的摘要，正是每篇文章开头的样子。</p>

<h2>保存文章</h2>
<ul>
<li><strong>在电脑上：</strong>使用 Chrome 浏览器扩展程序。<a href="/settings">设置</a>中的“从 Chrome 保存”介绍了安装方法。在“设置”的“访问令牌”下创建一个令牌，并在扩展程序的“选项”中输入。之后，点击工具栏按钮或按 Alt+Shift+S（在 Mac 上为 Option+Shift+S）即可保存正在阅读的网页；右键点击链接，还可以选择“将链接保存到 ${app}”。</li>
<li><strong>在 iPhone 或 iPad 上：</strong>按照“设置”中的分步说明，制作一次 Safari 快捷指令。之后在 Safari 中轻点“分享”即可看到它，它也会同步到你的 Mac。</li>
<li><strong>在 Android 上：</strong>用 Chrome 打开 ${app}，在 Chrome 的 ⋮ 菜单中选择“添加到主屏幕”→“安装”。之后在其他应用中轻点“分享”，即可选择 ${app}。</li>
<li><strong>在任何设备上：</strong>在收件箱顶部的输入框中粘贴链接。</li>
</ul>
<p>新文章在摘要完成前会显示“正在生成摘要…”，通常不到半分钟。</p>

<h2>阅读并把握要点</h2>
<p>每篇文章都以摘要开头：先用一句话说明文章的主题，再列出要点。摘要使用文章本身的语言。如需用其他语言阅读，请在“翻译成”下选择语言，然后点击“翻译”。摘要下方是建议的标签，轻点一下即可添加。</p>
<p>每个页面顶部的 <strong>Aa</strong> 按钮用于设置文章的外观：浅色或深色主题、配色和字体。你的选择会保存到账号中，在你登录的每个设备上都会生效。标题下方的“打开原文 ↗”会打开文章最初发布的页面。</p>

<h2>当文章显示“仅预览”时</h2>
<p>有些网站只向已登录或已订阅的读者显示文章。如果只凭链接下载这类页面，${app} 只能得到文章开头或登录页面，并会将文章标记为“仅预览”。${app} 从不绕过付费墙或登录。要保存完整文章，请在浏览器中登录该网站后打开文章，再用扩展程序或 Safari 快捷指令重新保存：它们会发送你所看到的页面，完整副本将取代预览。</p>

<h2>让收件箱井然有序</h2>
<ul>
<li><strong>整理</strong>逐篇显示未读文章及其摘要。可以选择“立即阅读”；选择“稍后”，文章会保留并移到队列末尾；也可以选择“归档”。</li>
<li><strong>收藏</strong>中是你点了“收藏”的文章。</li>
<li><strong>归档</strong>中是你已经读完的文章，点击“移回收件箱”即可把文章移回。</li>
<li><strong>文件夹和标签：</strong>用“归档”和“收藏”旁边的“文件夹”把文章放进一个文件夹，并在摘要下方为它添加任意数量的标签。之后，每个列表都可以只显示某个文件夹或标签。</li>
<li><strong>搜索</strong>位于每个列表顶部，会查找标题、摘要和文章正文。</li>
</ul>
<p>本指南也是一篇普通的文章，你可以随时将它归档或删除。</p>

<h2>你的数据</h2>
<p>在“设置”的“导出”中，可以下载你保存的全部内容，包括每篇文章的正文和摘要，格式为 JSON 或 Markdown。<a href="/about">关于</a>页面进一步介绍了 ${app}，<a href="/privacy">隐私</a>页面说明了它保存哪些数据以及原因。</p>
`,
  }),

  "zh-Hant": (app) => ({
    title: `歡迎使用 ${app}`,
    tldr: `${app} 為你保存想稍後閱讀的文章，每篇都附有簡潔的閱讀版本和簡短摘要；本指南說明如何儲存、閱讀和整理文章。`,
    keyPoints: [
      "可以用 Chrome 擴充功能、Safari 捷徑或 Android 的「分享」選單儲存，也可以在收件匣頂端貼上連結。",
      "每篇文章都以原文語言寫成的摘要開頭，摘要可以翻譯；Aa 按鈕可設定字型和配色。",
      "「僅預覽」表示網站需要登入或訂閱：請在登入狀態下開啟文章，再用擴充功能或捷徑重新儲存。",
      "整理、我的最愛、封存、資料夾、標籤和搜尋能幫你管理收件匣，在「設定」中還可以匯出儲存的所有內容。",
    ],
    html: `
<p>${app} 為你保存想稍後閱讀的文章。瀏覽網頁時儲存一個頁面，${app} 會保留它的連結、一份去除廣告和選單的簡潔閱讀版本，以及一段簡短的摘要，讓你在開始閱讀前就知道文章在講什麼。本指南就是你儲存的第一篇文章：上方的摘要，正是每篇文章開頭的樣子。</p>

<h2>儲存文章</h2>
<ul>
<li><strong>在電腦上：</strong>使用 Chrome 瀏覽器擴充功能。<a href="/settings">設定</a>中的「從 Chrome 儲存」說明了安裝方法。在「設定」的「存取權杖」下建立一個權杖，然後在擴充功能的「選項」中輸入。之後，按一下工具列按鈕或按 Alt+Shift+S (在 Mac 上為 Option+Shift+S)，即可儲存正在閱讀的網頁；在連結上按右鍵，還可以選擇「將連結儲存至 ${app}」。</li>
<li><strong>在 iPhone 或 iPad 上：</strong>依照「設定」中的逐步說明，建立一次 Safari 捷徑。之後在 Safari 中輕觸「分享」就會看到它，它也會同步到你的 Mac。</li>
<li><strong>在 Android 上：</strong>用 Chrome 開啟 ${app}，在 Chrome 的 ⋮ 選單中選擇「加到主畫面」→「安裝」。之後在其他應用程式中輕觸「分享」，就能選擇 ${app}。</li>
<li><strong>在任何裝置上：</strong>在收件匣頂端的輸入框中貼上連結。</li>
</ul>
<p>新文章在摘要完成前會顯示「正在產生摘要…」，通常不到半分鐘。</p>

<h2>閱讀並掌握重點</h2>
<p>每篇文章都以摘要開頭：先用一句話說明文章的主題，再列出重點。摘要使用文章本身的語言。如要以其他語言閱讀，請在「翻譯成」下選擇語言，然後按一下「翻譯」。摘要下方是建議的標籤，輕觸一下即可新增。</p>
<p>每個頁面頂端的 <strong>Aa</strong> 按鈕可設定文章的外觀：淺色或深色主題、配色和字型。你的選擇會儲存到帳號中，你登入的每個裝置都會套用。標題下方的「開啟原文 ↗」會開啟文章原本發布的頁面。</p>

<h2>當文章顯示「僅預覽」時</h2>
<p>有些網站只向已登入或已訂閱的讀者顯示文章。如果只憑連結下載這類頁面，${app} 只能取得文章開頭或登入頁面，並會將文章標示為「僅預覽」。${app} 絕不會繞過付費牆或登入。如要保留完整文章，請在瀏覽器中登入該網站後開啟文章，再用擴充功能或 Safari 捷徑重新儲存：它們會傳送你所看到的頁面，完整版本將取代預覽。</p>

<h2>讓收件匣井然有序</h2>
<ul>
<li><strong>整理</strong>會逐篇顯示未讀文章及其摘要。可以選擇「立即閱讀」；選擇「稍後」，文章會保留並移到佇列末端；也可以選擇「封存」。</li>
<li><strong>我的最愛</strong>中是你按了「加入我的最愛」的文章。</li>
<li><strong>封存</strong>中是你已經讀完的文章，按一下「移回收件匣」即可將文章移回。</li>
<li><strong>資料夾和標籤：</strong>用「封存」和「加入我的最愛」旁邊的「資料夾」把文章放進一個資料夾，並在摘要下方為它加上任意數量的標籤。之後，每個列表都可以只顯示某個資料夾或標籤。</li>
<li><strong>搜尋</strong>位於每個列表頂端，會搜尋標題、摘要和文章內文。</li>
</ul>
<p>本指南也是一篇普通的文章，你可以隨時將它封存或刪除。</p>

<h2>你的資料</h2>
<p>在「設定」的「匯出」中，可以下載你儲存的所有內容，包括每篇文章的內文和摘要，格式為 JSON 或 Markdown。<a href="/about">關於</a>頁面進一步介紹 ${app}，<a href="/privacy">隱私權</a>頁面說明它保存哪些資料以及原因。</p>
`,
  }),
};
