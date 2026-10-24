import { getFormatter, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { getAllowance, renewalDate, shareValue } from "@/lib/allowance";

/** Tells the user, on every page, when this month's AI allowance is nearly or wholly used. */
export async function AllowanceNotice({ userId }: { userId: string }) {
  const allowance = await getAllowance(getDb(), userId);
  if (!allowance.nearing && !allowance.reached) return null;
  const [t, format] = await Promise.all([getTranslations("Common"), getFormatter()]);
  const date = renewalDate(format, allowance);
  return (
    <p className="notice warn allowance-notice" role="status">
      {allowance.reached ? t("allowanceReached", { date }) : t("allowanceNearing", { share: shareValue(allowance), date })}
    </p>
  );
}
