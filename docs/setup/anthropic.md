# Anthropic API key (Claude summaries)

Summaries are written by Claude through the Anthropic API. This is the only paid part of the setup: you buy credits in advance and each summary uses a little of them. **Buying credits is your decision**; the app works without them, it just can't summarize.

## 1. Create the key

1. Sign in to the Claude Console at <https://platform.claude.com> (Anthropic's developer console, formerly console.anthropic.com; it's separate from a claude.ai chat subscription).
2. **Billing** (<https://platform.claude.com/settings/billing>): the API only works with prepaid credits. Click **Buy credits** and buy a small amount, such as $5–10; a few dollars cover hundreds of summaries (see the costs below). Credits are non-refundable and expire a year after purchase, so don't buy much more than you'll use. Auto-reload is optional; leave it off to start with.
3. **Spend limits** (on the same Billing page): click **Set limit** and choose a monthly limit, so a mistake can never cost more than you expect.
4. **API keys** (<https://platform.claude.com/settings/keys>): click **Create key** and name it `read-later`. Under **Expires**, choose **Custom** and a date about a year away, and put a reminder in your calendar a week before it. Credits expire a year after purchase too, so both can be renewed together. Shorter lifetimes mean replacing the key in Vercel every few weeks, and **Never** leaves a leaked key working forever; the monthly spend limit caps what a leaked key could cost in the meantime. Copy the key: it starts with `sk-ant-` and is shown only once. The `apikey_…` the list of keys shows afterwards is only the key's ID, which can't be used in its place.

   If the key does expire, new summaries fail with an authentication error. Put a new key in Vercel, redeploy, and use **Retry** on each affected article to run its failed summaries again.

Put it in Vercel's environment variables (and your local `.env`) as `ANTHROPIC_API_KEY`. Use a separate key for development if you like, so each shows up separately in the Console's usage page.

## 2. What it costs

Prices are per million tokens (a token is roughly ¾ of an English word; Chinese and Japanese use more tokens per character). The app writes the estimated cost of each summary next to it.

| Model | Input | Output | One 2,000-word article, roughly |
| --- | --- | --- | --- |
| Claude Opus 5.5 | $4 | $20 | 2–3 cents |
| Claude Sonnet 5.5 | $2 | $10 | about 1 cent |
| Claude Haiku 5.5 | $0.10 | $0.50 | under 0.1 cent |

Comparison mode runs all three on every save, so it costs about as much as the three together. Use it while you choose a default, then turn it off.

## 3. Choosing the default model

The default for new saves is Claude Opus 5.5. To pick your own:

1. Turn on **Settings → Comparison mode** for a few days, or open an article and click **Compare models** to run the others on it.
2. On each article's **Compare** page, read the three summaries side by side, with their cost and time.
3. Choose the one you like in **Settings → Default model**, and turn comparison mode off.

You can always re-run one article with another model with **Re-summarize** under its summary.

## Good to know

- Summaries are written in the article's own language, whatever the language of the app.
- `SUMMARY_EFFORT` (default `low`) controls how much Claude thinks before writing. `low` suits summaries; `medium` or `high` cost more and are slower, so raise it only if summaries miss things.
- If Claude declines to summarize an article (rare, for some sensitive topics), the summary shows the reason. Opus and Sonnet first retry on another Claude model automatically.
- The article text is sent to Anthropic to write the summary. See Anthropic's commercial terms and privacy policy for how API data is handled.
