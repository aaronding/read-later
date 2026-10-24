import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { formatCost, formatDuration } from "@/components/summary-card";
import { getDb } from "@/db";
import { monthlyLimitUsd } from "@/lib/allowance";
import { getCurrentUser, isAdmin, requireAdmin } from "@/lib/auth";
import { USAGE_PERIODS, isUsagePeriod, usageReport, type UsagePeriod, type UsageReportRow } from "@/lib/usage";

export async function generateMetadata(): Promise<Metadata> {
  // The title too would tell anyone else the page exists.
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return {};
  const t = await getTranslations("Admin");
  return { title: t("usage.title") };
}

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
type SummaryTranslator = Awaited<ReturnType<typeof getTranslations<"Summary">>>;

/** A total time: seconds as on a summary, then minutes, then hours. */
function formatTotalTime(ms: number, t: SummaryTranslator, format: Formatter): string {
  if (ms < 60_000) return formatDuration(ms, t, format);
  if (ms < 3_600_000) return format.number(ms / 60_000, { style: "unit", unit: "minute", maximumFractionDigits: 0 });
  return format.number(ms / 3_600_000, { style: "unit", unit: "hour", maximumFractionDigits: 1 });
}

/** Each user's AI usage by week, month or year, for admins only. */
export default async function UsagePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdmin("/admin/usage");
  const { period: asked } = await searchParams;
  const period: UsagePeriod = isUsagePeriod(asked) ? asked : "month";
  const [rows, t, tSummary, format, locale] = await Promise.all([
    usageReport(getDb(), period),
    getTranslations("Admin"),
    getTranslations("Summary"),
    getFormatter(),
    getLocale(),
  ]);

  const periods = new Map<string, UsageReportRow[]>();
  for (const row of rows) {
    const key = row.start.toISOString();
    periods.set(key, [...(periods.get(key) ?? []), row]);
  }
  const label = (start: Date) => {
    if (period === "week") return t("usage.weekOf", { date: format.dateTime(start, { dateStyle: "medium", timeZone: "UTC" }) });
    const text = format.dateTime(start, period === "month" ? { year: "numeric", month: "long", timeZone: "UTC" } : { year: "numeric", timeZone: "UTC" });
    // A heading starts with a capital, as "octobre 2026" otherwise wouldn't.
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  };
  const cost = (row: Pick<UsageReportRow, "costUsd" | "unpricedAnswers" | "summaries" | "translations">) => {
    const answers = row.summaries + row.translations;
    return (
      <>
        {/* With no known price at all, the cost is unknown, not zero. */}
        {formatCost(row.unpricedAnswers === answers ? null : row.costUsd, tSummary, format)}
        {row.unpricedAnswers > 0 && row.unpricedAnswers < answers && (
          <div className="muted small">{t("usage.unpriced", { count: row.unpricedAnswers })}</div>
        )}
      </>
    );
  };

  // Against each user's monthly limit as it is now (lib/allowance.ts).
  const limitShare = (row: UsageReportRow) => {
    const limit = monthlyLimitUsd(row.email);
    if (limit === null) return t("usage.noLimit");
    return t("usage.ofLimit", { share: limit === 0 ? 1 : Math.floor((row.chargedUsd / limit) * 100) / 100 });
  };

  return (
    <div className="usage">
      <div className="page-title">
        <h1>{t("usage.title")}</h1>
      </div>
      <p className="muted">{t("usage.intro")}</p>
      <nav className="usage-periods" aria-label={t("usage.periodsLabel")}>
        {USAGE_PERIODS.map((option) => (
          <Link key={option} href={`/admin/usage?period=${option}`} aria-current={option === period ? "page" : undefined}>
            {t("usage.period", { period: option })}
          </Link>
        ))}
      </nav>
      <p className="muted small">{t("usage.range", { period })}</p>
      {periods.size === 0 && <p className="muted">{t("usage.empty", { period })}</p>}
      {[...periods].map(([key, users]) => {
        const total = users.reduce(
          (sum, row) => ({
            summaries: sum.summaries + row.summaries,
            translations: sum.translations + row.translations,
            inputTokens: sum.inputTokens + row.inputTokens,
            outputTokens: sum.outputTokens + row.outputTokens,
            costUsd: sum.costUsd + row.costUsd,
            unpricedAnswers: sum.unpricedAnswers + row.unpricedAnswers,
            durationMs: sum.durationMs + row.durationMs,
          }),
          { summaries: 0, translations: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpricedAnswers: 0, durationMs: 0 },
        );
        const headingId = `usage-${key}`;
        return (
          <section key={key} className="card" aria-labelledby={headingId}>
            <h2 id={headingId}>{label(users[0]!.start)}</h2>
            <div className="usage-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("usage.user")}</th>
                    <th scope="col">{t("usage.answers")}</th>
                    <th scope="col">{t("usage.tokens")}</th>
                    <th scope="col">{t("usage.cost")}</th>
                    <th scope="col">{t("usage.time")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <tr key={row.userId}>
                      <th scope="row">
                        {row.name}
                        <div className="muted small">{row.email}</div>
                      </th>
                      <td>
                        {format.number(row.summaries + row.translations)}
                        <div className="muted small">
                          {t("usage.answersDetail", { summaries: row.summaries, translations: row.translations })}
                        </div>
                      </td>
                      <td>
                        {format.number(row.inputTokens)} / {format.number(row.outputTokens)}
                      </td>
                      <td>
                        {cost(row)}
                        {period === "month" && <div className="muted small">{limitShare(row)}</div>}
                      </td>
                      <td>{formatTotalTime(row.durationMs, tSummary, format)}</td>
                    </tr>
                  ))}
                </tbody>
                {users.length > 1 && (
                  <tfoot>
                    <tr>
                      <th scope="row">{t("usage.total")}</th>
                      <td>{format.number(total.summaries + total.translations)}</td>
                      <td>
                        {format.number(total.inputTokens)} / {format.number(total.outputTokens)}
                      </td>
                      <td>{cost(total)}</td>
                      <td>{formatTotalTime(total.durationMs, tSummary, format)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
