"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/config/app";
import { isSummaryModel } from "@/config/models";
import { getDb } from "@/db";
import { LOCALE_COOKIE, isLocale, type AppLocale } from "@/i18n/locales";
import { PREFERENCE_COOKIE, THEME_COOKIE, isThemeMode } from "@/lib/visitor-preferences";
import { isAdmin, requireAdmin, requireUser } from "@/lib/auth";
import { translateError } from "@/lib/error-message";
import { scheduleJobProcessing } from "@/lib/jobs/schedule";
import {
  deleteArticle,
  markOpened,
  resummarize,
  retryArticle,
  setArchived,
  setFavorite,
  setRead,
  showSummaryFrom,
  triageLater,
} from "@/lib/library";
import { toAppearance, type Appearance } from "@/lib/appearance";
import { SaveError, saveArticle, saveNotice } from "@/lib/save";
import { saveAppearance, updateSettings } from "@/lib/settings";
import { addTag, removeTag } from "@/lib/tags";
import { MAX_FEEDBACK_LENGTH, MAX_FEEDBACK_PER_DAY, sendFeedback } from "@/lib/feedback";
import { deleteFolder, findOrCreateFolder, setArticleFolder } from "@/lib/folders";
import { createApiToken, revokeApiToken } from "@/lib/tokens";
import { deleteTranslation, requestTranslation } from "@/lib/translations";
import { parseHttpUrl, parsePastedUrl } from "@/lib/urls";

// Every action checks the session itself and only touches the signed-in
// user's rows; the forms that call them are not a security boundary.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function articleId(formData: FormData): string {
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Invalid article id.");
  return id;
}

function flag(formData: FormData, name: string): boolean {
  return formData.get(name) === "true";
}

/**
 * Refreshes the page the form is on, unless the reader is leaving it for its
 * list once the action is done (`leaving`, see LeavingForm): a refresh would
 * show the article archived, unread or not found for a moment first.
 */
function refreshUnlessLeaving(formData: FormData) {
  if (!flag(formData, "leaving")) refresh();
}

export async function archiveAction(formData: FormData) {
  const user = await requireUser();
  await setArchived(getDb(), user.id, articleId(formData), flag(formData, "archived"));
  refreshUnlessLeaving(formData);
}

export async function favoriteAction(formData: FormData) {
  const user = await requireUser();
  await setFavorite(getDb(), user.id, articleId(formData), flag(formData, "favorite"));
  refresh();
}

export async function readAction(formData: FormData) {
  const user = await requireUser();
  await setRead(getDb(), user.id, articleId(formData), flag(formData, "read"));
  refreshUnlessLeaving(formData);
}

export async function deleteAction(formData: FormData) {
  const user = await requireUser();
  await deleteArticle(getDb(), user.id, articleId(formData));
  refreshUnlessLeaving(formData);
}

export async function retryAction(formData: FormData) {
  const user = await requireUser();
  await retryArticle(getDb(), user.id, articleId(formData), { admin: isAdmin(user) });
  scheduleJobProcessing();
  refresh();
}

export async function resummarizeAction(formData: FormData) {
  const user = await requireAdmin();
  const model = formData.get("model");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await resummarize(getDb(), user.id, articleId(formData), model, formData.get("show") !== "false");
  scheduleJobProcessing();
  refresh();
}

export async function showSummaryAction(formData: FormData) {
  const user = await requireAdmin();
  const model = formData.get("model");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await showSummaryFrom(getDb(), user.id, articleId(formData), model);
  refresh();
}

/** Translates a summary into another language, or tries a failed translation again. */
export async function translateSummaryAction(formData: FormData) {
  const user = await requireUser();
  const summaryId = String(formData.get("summaryId") ?? "");
  if (!UUID.test(summaryId)) throw new Error("Invalid summary id.");
  await requestTranslation(getDb(), { userId: user.id, summaryId, language: String(formData.get("language") ?? "") });
  scheduleJobProcessing();
  refresh();
}

export async function removeTranslationAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("translationId") ?? "");
  if (!UUID.test(id)) throw new Error("Invalid translation id.");
  await deleteTranslation(getDb(), user.id, id);
  refresh();
}

/** Called by the reader when it opens, rather than during render, so link prefetching can't mark articles read. */
export async function markOpenedAction(id: string) {
  const user = await requireUser();
  if (!UUID.test(id)) return;
  await markOpened(getDb(), user.id, id);
}

export async function triageAction(formData: FormData) {
  const user = await requireUser();
  const id = articleId(formData);
  const db = getDb();
  if (formData.get("decision") === "archive") await setArchived(db, user.id, id, true);
  else await triageLater(db, user.id, id);
  refresh();
}

/** The "Save it" button on the share confirmation page. */
export async function saveSharedLinkAction(formData: FormData) {
  const user = await requireUser();
  const url = parseHttpUrl(String(formData.get("url") ?? ""));
  if (!url) redirect("/inbox?shared=nolink");
  const result = await saveArticle(getDb(), {
    userId: user.id,
    url: url.href,
    title: String(formData.get("title") ?? "") || null,
    source: "android",
  });
  if (result.queued) scheduleJobProcessing();
  redirect(`/inbox?saved=${saveNotice(result)}`);
}

export interface SaveUrlState {
  ok: boolean;
  message: string;
}

export async function saveUrlAction(_previous: SaveUrlState, formData: FormData): Promise<SaveUrlState> {
  const user = await requireUser();
  const t = await getTranslations("Actions.saveUrl");
  const url = parsePastedUrl(String(formData.get("url") ?? ""));
  if (!url) return { ok: false, message: t("notAWebAddress") };
  try {
    const result = await saveArticle(getDb(), { userId: user.id, url: url.href, source: "web" });
    if (result.queued) scheduleJobProcessing();
    refresh();
    return {
      ok: true,
      message:
        saveNotice(result) === "refetching"
          ? t("alreadySavedRefetching")
          : result.outcome === "resaved"
            ? t("alreadySaved")
            : t("saved", { app: APP_NAME }),
    };
  } catch (error) {
    if (!(error instanceof SaveError)) throw error;
    return { ok: false, message: translateError(await getTranslations("Errors"), error.storedMessage) };
  }
}

export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();
  const model = formData.get("defaultModel");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await updateSettings(getDb(), user.id, {
    defaultModel: model,
    comparisonMode: isAdmin(user) && formData.get("comparisonMode") === "on",
  });
  refresh();
}

/**
 * Saves the appearance chosen in a picker. The picker has already changed the
 * page, so nothing is refreshed; the next page load reads the new choice.
 */
export async function saveAppearanceAction(choice: Appearance) {
  const user = await requireUser();
  await saveAppearance(getDb(), user.id, toAppearance(choice));
}

/**
 * Saves the interface language. A cookie remembers it on this browser too,
 * for pages seen signed out; "auto" follows the browser's languages again.
 */
export async function updateLocaleAction(formData: FormData) {
  const user = await requireUser();
  const value = formData.get("locale");
  const locale = isLocale(value) ? value : null;
  if (!locale && value !== "auto") throw new Error("Unknown language.");
  await updateSettings(getDb(), user.id, { locale });
  await rememberLocale(locale);
  refresh();
}

async function rememberLocale(locale: AppLocale | null) {
  const jar = await cookies();
  if (locale) jar.set(LOCALE_COOKIE, locale, PREFERENCE_COOKIE);
  else jar.delete(LOCALE_COOKIE);
}

/**
 * The language picker at the top of the site, for visitors who aren't signed
 * in. Until they choose, the language is the browser's, or English.
 */
export async function setVisitorLocaleAction(value: string) {
  if (!isLocale(value)) throw new Error("Unknown language.");
  await rememberLocale(value);
  refresh();
}

/** The theme picker at the top of the site, for visitors who aren't signed in. The page has already applied it. */
export async function setVisitorThemeAction(theme: string) {
  if (!isThemeMode(theme)) throw new Error("Unknown theme.");
  (await cookies()).set(THEME_COOKIE, theme, PREFERENCE_COOKIE);
}

export interface CreateTokenState {
  token?: string;
  name?: string;
  error?: string;
}

export async function createTokenAction(_previous: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    const t = await getTranslations("Actions.createToken");
    return { error: t("nameRequired", { chrome: "Chrome" }) };
  }
  const { token, record } = await createApiToken(getDb(), user.id, name);
  refresh();
  // Returned once, to be shown once. Only the hash is stored.
  return { token, name: record.name };
}

export async function revokeTokenAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("tokenId") ?? "");
  if (!UUID.test(id)) throw new Error("Invalid token id.");
  await revokeApiToken(getDb(), user.id, id);
  refresh();
}

export interface FeedbackState {
  sent?: boolean;
  error?: string;
  // What was written, given back with an error: React empties the form after every action.
  message?: string;
}

export async function sendFeedbackAction(_previous: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const user = await requireUser("/about");
  const message = String(formData.get("message") ?? "");
  const result = await sendFeedback(getDb(), user.id, message);
  if (result.ok) return { sent: true };
  const t = await getTranslations("About.feedback.errors");
  if (result.reason === "tooLong") return { error: t("tooLong", { max: MAX_FEEDBACK_LENGTH }), message };
  if (result.reason === "tooMany") return { error: t("tooMany", { count: MAX_FEEDBACK_PER_DAY }), message };
  return { error: t("empty"), message };
}

export async function addTagAction(formData: FormData) {
  const user = await requireUser();
  await addTag(getDb(), user.id, articleId(formData), String(formData.get("name") ?? ""));
  refresh();
}

export async function removeTagAction(formData: FormData) {
  const user = await requireUser();
  const tagId = String(formData.get("tagId") ?? "");
  if (!UUID.test(tagId)) throw new Error("Invalid tag id.");
  await removeTag(getDb(), user.id, articleId(formData), tagId);
  refresh();
}

export async function moveToFolderAction(formData: FormData) {
  const user = await requireUser();
  const db = getDb();
  const newName = String(formData.get("newFolder") ?? "").trim();
  const chosen = String(formData.get("folderId") ?? "");
  const folderId = newName ? await findOrCreateFolder(db, user.id, newName) : UUID.test(chosen) ? chosen : null;
  await setArticleFolder(db, user.id, articleId(formData), folderId);
  refresh();
}

export async function deleteFolderAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("folderId") ?? "");
  if (!UUID.test(id)) throw new Error("Invalid folder id.");
  await deleteFolder(getDb(), user.id, id);
  refresh();
}
