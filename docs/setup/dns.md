# Your own address (DNS on Cloudflare)

Your domain's DNS is already on Cloudflare. These steps point a subdomain, such as `read.example.com`, at the app on Vercel.

## 1. Add the domain in Vercel

1. In the Vercel project, open **Settings → Domains** and click **Add Domain**.
2. Enter `read.example.com` and confirm.
3. Vercel shows the DNS record it needs: a **CNAME** for `read` with a target made for your project, such as `d1d4fc829fe7bc7c.vercel-dns-017.com`. Copy the exact value it shows.

## 2. Add the record in Cloudflare

1. In the Cloudflare dashboard, choose your domain and open **DNS → Records**.
2. Click **Add record**:
   - **Type:** CNAME
   - **Name:** `read`
   - **Target:** the value from Vercel
   - **Proxy status:** **DNS only** (grey cloud). Vercel serves HTTPS itself and recommends a direct connection; Cloudflare's proxy in front of it gets in the way of Vercel's certificate and caching, and with Cloudflare's "Flexible" SSL mode it causes redirect loops.
3. Save. Back in Vercel, the domain turns valid within a few minutes, and Vercel issues the HTTPS certificate on its own.

## 3. Switch the app to the new address

The app uses the address in several places, so update them all:

1. **Vercel:** set `APP_URL=https://read.example.com` in **Settings → Environment Variables**, then redeploy.
2. **Google:** add `https://read.example.com` to the OAuth client's **Authorized JavaScript origins**, and `https://read.example.com/api/auth/callback/google` to its **Authorized redirect URIs**.
3. **Cloudflare Worker cron:** set `APP_URL` in `apps/cron-worker/wrangler.toml` and deploy it again.
4. **Your devices:** the Chrome extension's options and both Apple Shortcuts use the server URL too.

Then open `https://read.example.com`, sign in, and save a page to check.
