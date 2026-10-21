"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/config/app";
import { isSummaryModel } from "@/config/models";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
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
import { SaveError, saveArticle } from "@/lib/save";
import { updateSettings } from "@/lib/settings";
import { addTag, removeTag } from "@/lib/tags";
import { deleteFolder, findOrCreateFolder, setArticleFolder } from "@/lib/folders";
import { createApiToken, revokeApiToken } from "@/lib/tokens";
import { parsePastedUrl } from "@/lib/urls";

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

export async function archiveAction(formData: FormData) {
  const user = await requireUser();
  await setArchived(getDb(), user.id, articleId(formData), flag(formData, "archived"));
  refresh();
}

export async function favoriteAction(formData: FormData) {
  const user = await requireUser();
  await setFavorite(getDb(), user.id, articleId(formData), flag(formData, "favorite"));
  refresh();
}

export async function readAction(formData: FormData) {
  const user = await requireUser();
  await setRead(getDb(), user.id, articleId(formData), flag(formData, "read"));
  refresh();
}

export async function deleteAction(formData: FormData) {
  const user = await requireUser();
  await deleteArticle(getDb(), user.id, articleId(formData));
  const back = String(formData.get("redirectTo") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back);
  refresh();
}

export async function retryAction(formData: FormData) {
  const user = await requireUser();
  await retryArticle(getDb(), user.id, articleId(formData));
  scheduleJobProcessing();
  refresh();
}

export async function resummarizeAction(formData: FormData) {
  const user = await requireUser();
  const model = formData.get("model");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await resummarize(getDb(), user.id, articleId(formData), model, formData.get("show") !== "false");
  scheduleJobProcessing();
  refresh();
}

export async function showSummaryAction(formData: FormData) {
  const user = await requireUser();
  const model = formData.get("model");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await showSummaryFrom(getDb(), user.id, articleId(formData), model);
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

export interface SaveUrlState {
  ok: boolean;
  message: string;
}

export async function saveUrlAction(_previous: SaveUrlState, formData: FormData): Promise<SaveUrlState> {
  const user = await requireUser();
  const url = parsePastedUrl(String(formData.get("url") ?? ""));
  if (!url) return { ok: false, message: "That doesn't look like a web address (http or https)." };
  try {
    const result = await saveArticle(getDb(), { userId: user.id, url: url.href, source: "web" });
    if (result.queued) scheduleJobProcessing();
    refresh();
    return {
      ok: true,
      message: result.outcome === "resaved" ? "Already saved; moved to the top." : `Saved to ${APP_NAME}.`,
    };
  } catch (error) {
    if (error instanceof SaveError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();
  const model = formData.get("defaultModel");
  if (!isSummaryModel(model)) throw new Error("Unknown model.");
  await updateSettings(getDb(), user.id, { defaultModel: model, comparisonMode: formData.get("comparisonMode") === "on" });
  refresh();
}

export interface CreateTokenState {
  token?: string;
  name?: string;
  error?: string;
}

export async function createTokenAction(_previous: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the token a name, such as “Chrome on my laptop”." };
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
