# Live Match Centre Admin Setup

The page reads published season fixtures/results from the local data files and listens to the public Firestore collection `liveMatchCentre` for score, status, and event overlays. The browser never writes directly to that collection. `publishLiveMatchUpdate` is a callable Cloud Function and accepts writes only when the Firebase Auth ID token has the server-assigned `lslMatchAdmin: true` custom claim.

## Enable An Admin Account

1. In Firebase Authentication, enable the Email/Password provider and create the intended administrator account.
2. From a trusted Admin SDK environment, assign the claim to that account UID. Never put a service-account key or admin secret in the website.

~~~js
const { getAuth } = require("firebase-admin/auth");
await getAuth().setCustomUserClaims("AUTH_USER_UID", { lslMatchAdmin: true });
~~~

3. Deploy the callable function and Firestore rules from the LSL Website project with `firebase deploy --only functions:publishLiveMatchUpdate,firestore:rules`. Review the current Firebase Console rules first: deploying `firestore.rules` replaces the active ruleset.
4. Sign out and back in to refresh the account's ID token. The Match Admin panel will appear after the claim is verified.

The rules permit public reads of live status overlays and deny all client writes. Cloud Functions use the Admin SDK to append event history and update status/score. The function validates season, match ID, status, score bounds, event type, team side, minute, and text length. Static historical JSON remains unchanged; live overlays do not rewrite official season statistics.

The current Firebase project has not been deployed or configured for a match-admin claim as part of this code change. Until setup is completed, public static results continue to render, and the live feed reports connection/setup errors rather than implying that updates are active.
