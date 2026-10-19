# Make Live H2H work for $0

The free backend is implemented. It still needs your Cloudflare account and Firebase configuration before real online matches work. Nothing has been deployed to your accounts by this update.

Use **Cloudflare Workers Free**, **Firebase Spark**, and the existing **GitHub Pages** site. Do not enable Workers Paid or Firebase Blaze. The previous Firebase Functions deployment is blocked and is not used by this version.

## 1. Create your free Cloudflare account

1. Open <https://dash.cloudflare.com/sign-up> and create an account.
2. You do not need to buy a domain or add an existing website. This backend uses a free `workers.dev` address.
3. Keep Workers on the **Free** plan. If a screen asks you to buy a plan, stop; that is not a requirement for this setup.

## 2. Prepare Firebase

Use the existing **lsl-rivals** project at <https://console.firebase.google.com/>.

1. Check that its plan is **Spark**. Do not attach a billing account.
2. Open **Build > Authentication** and click **Get started** if it has not been initialized. There is no need to enable Email/Password: the Worker signs custom tokens for the existing username/passcode form.
3. Check that `src/firebase-config.js` matches the web app in **Project settings > General**. The backend public API key/project in `free-backend/wrangler.jsonc` must match too. If Auth reports `CONFIGURATION_NOT_FOUND`, initialize Authentication. If it reports an invalid API key, copy the correct web app configuration from this same project.
4. Keep your existing Firestore database and data. Back up the current rules before changing them in step 5 below.
5. Open **Project settings > Service accounts > Firebase Admin SDK > Generate new private key**. Download the JSON outside the GitHub repository. It lets the private Worker check credentials and save verified results. Never upload this JSON to GitHub, add it to the website, or paste it into chat.

The service account needs access to this project's Firestore and Firebase Authentication. The Firebase Admin SDK service account normally already has this access. If using a dedicated service account instead, grant `roles/datastore.user` and `roles/firebaseauth.admin`. Signing uses its private key; no IAM `signBlob` call or Cloud Function is needed.

## 3. Deploy the free backend

Install Node.js 22 or newer if needed. In PowerShell, open your game folder:

```powershell
cd 'C:\Users\TMuhu\OneDrive\Documents\GitHub\Lantern-Rush'
cd free-backend
npm ci
npx wrangler login
```

The login command opens Cloudflare in your browser. Sign in to the free account you just created and approve the CLI connection. This does not require a paid plan.

Open `free-backend/wrangler.jsonc`:

- `ALLOWED_ORIGINS` must contain the website origin, for example `https://goatmt.github.io` (without `/Lantern-Rush/`). Local testing origins are already included.
- Account Admin uses the shared admin password configured in the game. The backend validates it for every account operation; no account UID allowlist or separate account sign-in is required.
- Leave the SQLite Durable Object configuration intact. SQLite-backed Durable Objects are available on Workers Free.
- Leave `MAX_DAILY_REQUESTS` at `6000` initially. This is a safety cap, not a promise of a particular number of matches.

Build and deploy:

```powershell
npm run build
npm run deploy
```

`build` only checks/bundles locally. `deploy` publishes the Worker. Copy the resulting address, such as `https://lantern-rush-free.YOUR-SUBDOMAIN.workers.dev`.

Store the downloaded Firebase JSON as a **Worker secret**, using your actual local filename:

```powershell
Get-Content -Raw -LiteralPath 'C:\path\to\your-firebase-key.json' | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

That command sends the key only to your Cloudflare Worker secret store. Do not put its contents in `wrangler.jsonc`. The downloaded JSON does not belong in either game folder.

Open your Worker URL followed by `/health`. It should show `Lantern Rush Free H2H`. This confirms the Worker is reachable; account/Firestore access is checked separately when signing in.

## 4. Point the game at your Worker

From the main game folder:

```powershell
cd ..
node scripts/configure-free-backend.mjs https://lantern-rush-free.YOUR-SUBDOMAIN.workers.dev
```

This checks the public health endpoint and saves only the public URL in `src/live-config.js`. No secret goes into the website. Publish the updated repository to GitHub Pages. If you also run the other LSL Game copy, use the same URL in its `src/live-config.js`.

## 5. Activate accounts and rooms together

Do these steps together so users do not get stuck between the old and new account systems:

1. Confirm the Worker is deployed, its secret is set, and GitHub Pages serves the updated `src/live-config.js`.
2. In Firebase Console > Firestore > Rules, publish this repository's `firestore.rules`. These rules protect account credentials and restrict signaling to accepted match participants.
3. In Firestore Data, create/update collection **runtime**, document **live**, with **enabled = true** (Boolean).
4. Refresh the game and sign in again. Existing usernames, six-digit passcodes, profile IDs and histories are reused. Old hashed credentials migrate only after a correct sign-in. Accounts without usable credentials can be repaired from Account Admin after entering the shared admin password.

Do not publish the new rules early without finishing activation. Do not reopen public credential writes to work around a setup error.

## 6. Play the first match

1. Sign into two different Lantern Rush accounts on two devices.
2. Host: **Live H2H > Create Room**. Start with a 1-minute match.
3. Guest: **Join Room**, enter the Room ID, then **Request to Join**.
4. Host: **Accept**. Each player chooses a team and starting lineup, then presses **Ready**.
5. Host presses **Start Match**. Play both halves; both players press **Continue** at halftime.
6. At full time, leave both pages open until both histories are confirmed saved. Check each account's History.

Test on the same Wi-Fi first, then on different networks. WebRTC uses free STUN and a direct connection, with no TURN subscription. Some routers, school networks and mobile carriers block direct connections. If a connection times out, try another network; the game will not silently purchase a relay or fabricate a result.

## Free limits and privacy

- Workers Free and Firebase Spark have usage/storage limits. When reached, online operations fail until the quota resets or storage is freed; they do not automatically upgrade to a paid plan. Keep both accounts on their free plans.
- The backend also stops at its daily API request cap, resetting at midnight UTC. Public Firestore reads and existing CPU-history writes have their own Firebase quotas.
- Account passcodes remain plain text in the protected `gameLogins` collection, as requested. Only the server checks them. Profile/session responses never include them.
- A short in-memory request throttle is used to reduce abuse. Request bodies, passcodes and service-account keys are not logged by application code. Worker observability is disabled in the supplied configuration.
- The backend still requires both players' matching timeline confirmations and replays the game before saving two mirrored reports. Scores submitted by a browser are not used as final results. Two colluding modified clients can still agree on a fabricated input timeline; this is private peer-hosted play, not a dedicated anti-cheat simulation server.
- Closing/reloading the host's tab loses the running simulation. Short interruptions have a 25-second reconnection window; abandoned matches are not saved as completed results.
- Expired room/signaling/trace documents are retained until administrative cleanup. Clean these up periodically if usage grows; do not delete `gameProfiles/*/matches` history. No paid TTL cleanup feature is enabled.

## Updates and validation

After changing game physics, rules or roster data, rebuild and redeploy the Worker and publish the matching frontend together. Avoid updating the engine during live matches. The build generates `free-backend/api.generated.js` from the shared existing server operations and refreshes the verification engine/catalog.

```powershell
node --test tests/free-backend.test.js tests/live-h2h.test.js tests/account-store.test.js
node scripts/check.mjs
npm --prefix free-backend run build
npm --prefix free-backend run test:runtime
```

Local tests cover room approval, credentials, token signing, result replay, report mirroring, free quota boundaries and the Worker runtime's setup errors. Production Firebase access/rules and a real cross-network match still require the activation steps above.

Official references (checked September 21, 2026):
- Workers Free limits: <https://developers.cloudflare.com/workers/platform/pricing/>
- Free SQLite Durable Objects: <https://developers.cloudflare.com/durable-objects/platform/pricing/>
- Free STUN: <https://developers.cloudflare.com/realtime/turn/faq/>
- Custom Firebase tokens: <https://firebase.google.com/docs/auth/admin/create-custom-tokens>
- Firestore REST server access: <https://firebase.google.com/docs/firestore/use-rest-api>
