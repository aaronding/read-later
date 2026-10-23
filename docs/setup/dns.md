# Your own address (DNS on Cloudflare)

The app's address is `https://www.readsooner.com`, and `readsooner.com` redirects to it ([decision 118](../decisions.md)). The domain is registered at Namecheap, and its DNS is on Cloudflare.

## 1. Move the DNS to Cloudflare

1. In the Cloudflare dashboard, click **Add a domain**, enter `readsooner.com` and choose the **Free** plan.
2. Cloudflare copies the records it finds. Delete the ones for Namecheap's parking page: an `A` record for `readsooner.com` and a `CNAME` for `www` to `parkingpage.namecheap.com`.
3. In Namecheap, open **Domain List → Manage → Nameservers**, choose **Custom DNS** and enter the two nameservers Cloudflare shows. If DNSSEC is on under **Advanced DNS**, turn it off first.
4. Cloudflare emails you when the domain is active, usually within an hour or two.

## 2. Add the domain in Vercel

1. In the Vercel project, open **Settings → Domains** and click **Add Domain**.
2. Enter `readsooner.com`, and accept adding `www` with **www.readsooner.com** as the main domain. `readsooner.com` then redirects to it with a 308, keeping the page's path.
3. **View DNS configuration** under each domain shows the record it needs. With the DNS on Cloudflare, both are a **CNAME** to a target made for the project, such as `881d61f6384a0ca3.vercel-dns-017.com`. Copy the exact value it shows. Vercel's older values (`76.76.21.21` and `cname.vercel-dns.com`) still work, but it recommends the project's own.

## 3. Add the records in Cloudflare

1. In the Cloudflare dashboard, choose `readsooner.com` and open **DNS → Records**.
2. Add two records with **Add record**:
   - **Type:** CNAME, **Name:** `@`, **Target:** the value from Vercel
   - **Type:** CNAME, **Name:** `www`, **Target:** the value from Vercel

   Cloudflare allows a CNAME on the bare domain: it looks up the target and answers with its addresses itself.
3. Set both to **DNS only** (grey cloud); Cloudflare turns the proxy on for a new record. Vercel serves HTTPS itself and recommends a direct connection; Cloudflare's proxy in front of it gets in the way of Vercel's certificate and caching, and with Cloudflare's "Flexible" SSL mode it causes redirect loops.
4. Back in Vercel, click **Refresh** on both domains. They turn valid within a few minutes, and Vercel issues the HTTPS certificates on its own.

## 4. Switch the app to the new address

The app uses the address in several places, so update them all, always with `www`. The extension and the Shortcuts send your token in a header that a redirected request can lose, so they must not go through the redirect.

1. **Vercel:** set `APP_URL=https://www.readsooner.com` in **Settings → Environment Variables**, then redeploy.
2. **Google:** add `https://www.readsooner.com` to the OAuth client's **Authorized JavaScript origins**, and `https://www.readsooner.com/api/auth/callback/google` to its **Authorized redirect URIs**.
3. **Cloudflare Worker cron:** `APP_URL` in `apps/cron-worker/wrangler.toml` is already the new address; deploy it again.
4. **Your devices:** the Chrome extension's options and both Apple Shortcuts use the server URL too.

Then open `https://www.readsooner.com`, sign in, and save a page to check. Also open `https://readsooner.com` once to see it redirect.
