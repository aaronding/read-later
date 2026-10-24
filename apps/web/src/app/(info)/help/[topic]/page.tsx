import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HelpPage } from "@/components/help-page";
import { isHelpTopic } from "@/lib/help";

type Props = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic } = await params;
  if (!isHelpTopic(topic) || topic === "start") return {};
  const t = await getTranslations("Help");
  return { title: `${t(`${topic}.title`, { chrome: "Chrome", safari: "Safari", android: "Android" })} · ${t("title")}` };
}

export default async function HelpTopicPage({ params }: Props) {
  const { topic } = await params;
  // /help itself is the first topic.
  if (!isHelpTopic(topic) || topic === "start") notFound();
  return <HelpPage topic={topic} />;
}
