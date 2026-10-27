// The Help pages, in the order the menu lists them. "start" is /help itself.
export const HELP_TOPICS = ["start", "firefox", "safari", "android", "using"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export function isHelpTopic(value: unknown): value is HelpTopic {
  return HELP_TOPICS.some((topic) => topic === value);
}

export function helpHref(topic: HelpTopic): string {
  return topic === "start" ? "/help" : `/help/${topic}`;
}
