# Google sign-in (OAuth client)

The app signs you in with your Google account. Google needs to know the app's address, and gives back a client ID and secret. This is free.

You can redo the redirect addresses at any time, so if you don't have your final domain yet, start with `http://localhost:3000` and the Vercel address, and add the domain later.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com> and sign in with the Google account you'll use for the app.
2. At the top, open the project picker and click **New project**. Name it `ReadSooner` and create it. Make sure it's selected.

## 2. Set up the consent screen ("Google Auth Platform")

1. In the menu, open **Google Auth Platform** (search for it if it isn't in the menu). If it shows **Get started**, click it.
2. **App information:** app name `ReadSooner`, and your email as the user support email.
3. **Audience:** choose **External**.
4. **Contact information:** your email. Agree to the policy and click **Create**.
5. Open **Audience** and, under **Test users**, click **Add users** and add your own Gmail address.
6. Open **Branding** and, under **App domain**, set the application home page to `https://www.readsooner.com` and the privacy policy link to `https://www.readsooner.com/privacy`. Both pages can be read without signing in. Click **Save**.

Leave the app in **Testing** while only the addresses in `ALLOWED_EMAILS` use it. The app only asks for your name, email address and profile picture. Google treats these as basic scopes: they need no review, and **Google doesn't limit them to your test users**, so any Google account could reach the consent screen. What keeps everyone else out is the app's own check, `ALLOWED_EMAILS`. Only the addresses listed there get an account.

To open sign-in to everyone, set `ALLOWED_EMAILS` to `*` and publish the app: open **Audience** and click **Publish app**. With only basic scopes, publishing needs no review. `BLOCKED_EMAILS` then keeps particular accounts out.

## 3. Create the OAuth client

1. Open **Clients** and click **Create client**.
2. **Application type:** **Web application**. **Name:** `ReadSooner web`.
3. **Authorized JavaScript origins:** add each address the app runs at:
   - `https://www.readsooner.com`
   - `http://localhost:3000` (for development)
   - optionally the Vercel address, such as `https://read-later-yourname.vercel.app`
4. **Authorized redirect URIs:** the same addresses followed by `/api/auth/callback/google`:
   - `https://www.readsooner.com/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
5. Click **Create**. Copy the **Client ID** and the **Client secret** now, or download them as JSON. Google only shows the full secret at this moment; later you'd have to create a new one.

## 4. Use them

Set them as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your local `.env` and in Vercel's environment variables. Also set `ALLOWED_EMAILS` to your Gmail address.

Google can take from a few minutes to a few hours to apply changes to a client.

If sign-in fails with **redirect_uri_mismatch**, the address you opened the app at isn't in the redirect URIs exactly as written (check `http` vs `https`, `www.`, and the port). Also check that `APP_URL` is that same address: the app always sends Google back to `APP_URL`.
