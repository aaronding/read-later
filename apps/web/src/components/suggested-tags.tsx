import { getTranslations } from "next-intl/server";
import { addTagAction, removeTagAction } from "@/app/actions";
import { getDb } from "@/db";
import { tagsForArticle } from "@/lib/tags";
import { SubmitButton } from "./submit-button";

/** The article's tags, with Claude's suggestions as one-tap additions. */
export async function SuggestedTags({ articleId, userId, suggestions }: { articleId: string; userId: string; suggestions: string[] }) {
  const [current, t] = await Promise.all([tagsForArticle(getDb(), userId, articleId), getTranslations("Tags")]);
  const have = new Set(current.map((tag) => tag.name.toLowerCase()));
  const offered = suggestions.filter((name) => !have.has(name.toLowerCase()));
  return (
    <div className="tag-list" aria-label={t("label")}>
      {current.map((tag) => (
        <form key={tag.id} action={removeTagAction} className="inline-form">
          <input type="hidden" name="id" value={articleId} />
          <input type="hidden" name="tagId" value={tag.id} />
          <SubmitButton className="button small" title={t("remove", { name: tag.name })}>
            #{tag.name} ×
          </SubmitButton>
        </form>
      ))}
      {offered.map((name) => (
        <form key={name} action={addTagAction} className="inline-form">
          <input type="hidden" name="id" value={articleId} />
          <input type="hidden" name="name" value={name} />
          <SubmitButton className="button small ghost" title={t("addSuggested", { name })}>
            + {name}
          </SubmitButton>
        </form>
      ))}
      <form action={addTagAction} className="inline-form">
        <input type="hidden" name="id" value={articleId} />
        <label htmlFor="new-tag" className="visually-hidden">
          {t("addLabel")}
        </label>
        <input id="new-tag" name="name" type="text" placeholder={t("addPlaceholder")} maxLength={60} style={{ width: "8rem", minHeight: 32, padding: "0.2em 0.6em" }} />
      </form>
    </div>
  );
}
