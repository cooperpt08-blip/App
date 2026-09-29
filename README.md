# Shape Up

A phone app (iPhone and Android) that recommends haircuts. A customer takes a
photo, answers a few questions about their hair, and gets 3 recommended cuts
plus a **cut card** that tells their barber exactly what to do. Barbershops pay
a monthly fee; their clients use the app free by scanning the shop's QR code.

## What's in this repository

| Folder | What it is |
|---|---|
| `mobile/` | **The app.** Built with Expo (React Native), so one codebase runs on iPhone, iPad and Android. |
| `supabase/` | **The backend.** The database, its security rules, and photo storage, all hosted by Supabase. |
| `src/`, `public/`, and the Next.js files at the top level | The earlier website version. No longer used. It can be deleted once you're happy with the app. |

## Build plan

Each step is built, then you test it before we move on.

| Step | What | Status |
|---|---|---|
| 1 | Database and security rules, sign-in, shop owners create a shop with a QR code, invite barbers, customers link to a shop | ✅ built, ready to test |
| 2 | Customer flow in the app: photos, questions, recommendations (free demo mode until you add a Claude key), monthly limits | next |
| 3 | "Send to my barbershop": pick a cut, a barber, an appointment time, and give photo permission | |
| 4 | Barbers' "Upcoming cuts" tab: live updates, new-card badge, statuses, notes, full-size photos | |
| 5 | Automatic photo deletion, updated privacy wording, a slot for AI preview images (no paid service until you approve one) | |
| Last | Add AI keys, publish to the App Store and Google Play | |

## Accounts you need

| Service | What for | Cost | When |
|---|---|---|---|
| [Supabase](https://supabase.com) | Accounts, database, photo storage | Free plan is fine for testing | **Now** |
| Expo Go app on your phone (App Store / Google Play) | Run the app on your phone while we build it | Free | **Now** |
| [Node.js](https://nodejs.org) (LTS) on your computer | Starts the app for Expo Go | Free | **Now** |
| [Expo](https://expo.dev) account | Builds the real App Store version | Free plan | Last step |
| [Apple Developer Program](https://developer.apple.com/programs/) | Required to publish on the App Store | $99/year | Last step |
| [Google Play Console](https://play.google.com/console) | Required to publish on Google Play | $25 one-time | Last step (optional) |
| [Claude Console](https://platform.claude.com) | Real AI recommendations | Pay per use | Last step |

## Set up Supabase (one time, about 15 minutes)

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**. Pick any name and
   region, and save the database password somewhere safe.
2. **Create the database.** In your project, open **SQL Editor → New query**. Open the file
   `supabase/migrations/20260929000000_shape_up.sql` from this repository, copy all of it, paste it in,
   and click **Run**. You should see "Success. No rows returned".
3. **Leave email sign-in as it is.** People sign in with an email and password. New accounts get Supabase's
   standard "Confirm your signup" email, so there's nothing to change. Keep **Confirm email** turned on
   (Authentication → Sign In / Providers → Email). It's on by default, and it stops someone from signing up
   with a barber's email address to take their shop invite.
4. **Copy your app keys.** Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key (or the "publishable" key).

Supabase's built-in email only sends a few emails per hour. That's enough for testing. Before launch we'll
connect a proper email service.

## Run the app on your phone

1. Install **Node.js** (LTS) on your computer and **Expo Go** on your phone.
2. In Terminal:
   ```
   git clone -b claude/shape-up-haircut-app-3ap6hb https://github.com/cooperpt08-blip/App.git
   cd App/mobile
   npm install
   cp .env.example .env.local
   ```
3. Open `mobile/.env.local` in a text editor and paste your Project URL and anon key after the `=` signs.
4. Run `npx expo start`. A QR code appears in Terminal. Scan it with your iPhone's Camera app (or with
   Expo Go on Android). Your phone and computer need to be on the same Wi-Fi.

## Privacy, in plain terms

- Nobody can read the database without signing in, and the security rules decide exactly what each person
  sees. A shop can never see another shop's customers or cut cards.
- Photos are only uploaded when a customer taps "Send to my barbershop" and agrees to share them. They go to
  private storage that only that shop's barbers can open, and they're deleted 7 days after the appointment
  (or 30 days after sending if there's no appointment).
- `supabase/tests/` holds automatic checks that prove these rules work: 36 scenarios, such as "shop B tries to
  read shop A's cut cards". It's for testing only; never run it on your real project.
