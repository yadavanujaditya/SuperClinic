# Firebase backend

SuperClinic uses Firebase for **login** (Google + email/password) and **cloud sync**
(Firestore). The app still works fully without signing in, using on-device storage
only, the same as before.

## What gets synced

| Data | Firestore path | Synced? |
|---|---|---|
| Custom ClinicFlow complaints | `users/{uid}/complaints/{id}` | Yes |
| SuperSummary templates | `users/{uid}/templates/{id}` | Yes |
| AI provider + custom AI instructions | `users/{uid}` | Yes |
| AI API keys | none | **No, stays on the device only** |
| Uploaded PDFs, tags, patient sessions | none | No (not stored anywhere yet) |

- Data saved **before** signing in is uploaded the first time you sign in, so nothing is lost.
- **Signing out** removes synced data from that browser (for shared hospital PCs). It stays safe in the cloud.
- Security rules (`firestore.rules`) let each doctor read and write **only their own** `users/{uid}` data.

## Step 1: Test locally (no Firebase account needed)

Needs Node 20+ and Java 11+ (the Firestore emulator runs on Java).

```bash
cd clinicalmind
npm install
cp .env.example .env.local      # VITE_USE_EMULATORS=true is already set
```

Terminal 1 (Firebase emulators: Auth, Firestore, plus a dashboard at http://127.0.0.1:4000):

```bash
npm run emulators
```

Terminal 2 (the app at http://localhost:5173):

```bash
npm run dev
```

Click the profile icon (top right), then **Sign in / Profile**, then create an account. In
local test mode any email works, and "Continue with Google" shows a fake Google screen.
You can browse the saved data at http://127.0.0.1:4000/firestore.

Emulator data is wiped when you stop the emulators.

## Step 2: Go live on Firebase

1. Go to https://console.firebase.google.com, choose **Add project** (e.g. `superclinic`), and note the **project ID**.
2. **Build → Authentication → Get started.** Enable **Google** and **Email/Password**.
3. **Build → Firestore Database → Create database.** Pick the `asia-south1` (Mumbai) location and start in **production mode**.
4. **Project settings → Your apps → Web (`</>`).** Register the app and copy the `firebaseConfig` values.
5. Edit `clinicalmind/.env.local`: set `VITE_USE_EMULATORS=false` and fill in the `VITE_FIREBASE_*` values.
6. Point the CLI at your project (replace `superclinic` with your project ID):

```bash
cd clinicalmind
npx firebase login
npx firebase use --add superclinic
```

7. Deploy the site and the security rules:

```bash
npm run deploy
```

Your site is live at `https://<project-id>.web.app`. If you add a custom domain, also add it
under **Authentication → Settings → Authorized domains** so Google sign-in works there.

Login and Firestore both fit within the free Spark plan for normal use.
