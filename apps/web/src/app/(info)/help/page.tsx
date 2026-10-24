import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HelpPage } from "@/components/help-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Help");
  return { title: t("title") };
}

export default function HelpStartPage() {
  return <HelpPage topic="start" />;
}
