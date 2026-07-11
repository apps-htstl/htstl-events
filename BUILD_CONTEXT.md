# HTSL Events — Build Context & Progress Tracker

> **Purpose**: This file tracks exactly where we are in the build, what's been coded,
> what's next, and key decisions made. Load this file at the start of every new session.

---

## 🗂️ Project Overview

- **App Name**: HTSL Events
- **Bundle Slug**: `htsl-events`
- **Firebase Project ID**: `htsl-events`
- **Platform**: Expo SDK 56 (React Native) — iOS first
- **Navigation**: Expo Router (file-based)
- **Backend**: Firebase Firestore + Cloud Functions (Node 18, TypeScript)
- **Auth**: Firebase Auth — Email Magic Link (passwordless)
- **Notifications**: SendGrid (email) + Twilio SMS
- **Workspace**: `/Users/garuda/Repos/Apps/RegiCheck`

---

## 🔑 Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Single app for all roles | ✅ Yes | Admin and volunteers in one binary |
| Check-in model | Fractional: `checkedInCount` + `checkins[]` array | Groups can arrive in stages |
| QR delivery | Email (SendGrid) primary, SMS (Twilio) secondary | WhatsApp deferred |
| Auth flow | Magic link (no passwords) | Volunteer-friendly |
| Secrets | `.env.local` + EAS Secrets + Firebase Secret Manager | Never in git |
| Offline strategy | Standard Firestore offline persistence | Venue has reliable Wi-Fi |
| CSV upload | Mobile document picker (expo-document-picker) | Admins use phones |

---

## 📁 Directory Structure (Planned)

```
RegiCheck/
├── app/
│   ├── _layout.tsx            ← Root auth guard + role redirect
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx        ← Stack layout for auth screens
│   │   └── login.tsx          ← Magic link login
│   ├── (admin)/
│   │   ├── _layout.tsx        ← Admin tab navigator
│   │   ├── events/
│   │   │   ├── index.tsx      ← Event list
│   │   │   ├── create.tsx     ← Create new event
│   │   │   └── [eventId]/
│   │   │       ├── index.tsx         ← Event dashboard
│   │   │       ├── registrations.tsx ← Registrant list
│   │   │       ├── import.tsx        ← CSV import wizard
│   │   │       ├── seating.tsx       ← Tier + section config
│   │   │       ├── volunteers.tsx    ← Manage volunteers
│   │   │       ├── send-tickets.tsx  ← Send QR tickets
│   │   │       └── analytics.tsx     ← Attendance stats
│   │   └── settings.tsx
│   └── (volunteer)/
│       ├── _layout.tsx        ← Volunteer tab navigator
│       ├── scan.tsx           ← QR scanner
│       ├── checkin.tsx        ← Check-in confirm
│       ├── dashboard.tsx      ← Live attendance
│       └── lookup.tsx         ← Manual search
├── components/
│   ├── ui/                    ← Reusable design system components
│   └── ...
├── lib/
│   ├── firebase.ts            ← Firebase client init
│   ├── auth.ts                ← Auth helpers
│   ├── firestore.ts           ← Data access layer
│   └── types.ts               ← Shared TypeScript types
├── context/
│   └── AuthContext.tsx        ← Auth state provider
├── functions/
│   └── src/
│       ├── index.ts           ← Cloud Functions entry
│       ├── qr.ts              ← QR token generation
│       ├── notify.ts          ← Email + SMS dispatch
│       ├── checkin.ts         ← QR scan validation
│       └── import.ts          ← CSV bulk import
└── public-ticket/
    └── index.html             ← Static ticket page (Firebase Hosting)
```

---

## ✅ Build Progress

### Phase 1 — Foundation (Day 1–2)

- [x] `create-expo-app` scaffolded (SDK 56, tabs template)
- [x] Firebase config files created (`.firebaserc`, `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`)
- [x] `functions/` directory initialized with `package.json`, `tsconfig.json`, `src/index.ts`
- [x] `public-ticket/index.html` stub created
- [x] `.env.local` populated with real API keys
- [x] `app.json` updated (name: HTSL Events, slug: htsl-events, scheme: htsl-events, bundleId: com.htsl.events)
- [x] Firebase client SDK installed (`firebase` JS SDK v11)
- [x] `lib/firebase.ts` — Firebase app init with AsyncStorage auth persistence + Firestore offline persistence
- [x] `lib/types.ts` — Shared TypeScript types (User, Event, Tier, Section, Registration, CheckIn, Org)
- [x] `context/AuthContext.tsx` — Auth state provider: sendMagicLink, completeSignIn, role detection, Firestore user fetch
- [x] `app/_layout.tsx` — Root layout with AuthProvider + role-based redirect guard
- [x] `app/(auth)/_layout.tsx` — Auth stack layout
- [x] `app/(auth)/login.tsx` — Full magic link login screen (send + confirm + deep link handler)
- [x] `app/(admin)/_layout.tsx` — Admin tab layout (Events, Settings)
- [x] `app/(admin)/events/index.tsx` — Events list screen (empty state + create button)
- [x] `app/(admin)/events/create.tsx` — Create event placeholder
- [x] `app/(admin)/settings.tsx` — Settings screen with account info
- [x] `app/(volunteer)/_layout.tsx` — Volunteer tab layout (Scan, Attendance, Lookup)
- [x] `app/(volunteer)/scan.tsx` — Scan screen placeholder
- [x] `app/(volunteer)/dashboard.tsx` — Attendance dashboard placeholder
- [x] `app/(volunteer)/lookup.tsx` — Lookup screen placeholder
- [x] **iOS bundle verified — 1,547 modules, 0 errors** ✅

### Phase 2 — Event & Registration Management (Day 2–4)
- [ ] `app/(admin)/_layout.tsx` — Admin tabs
- [ ] `app/(admin)/events/index.tsx` — Event list
- [ ] `app/(admin)/events/create.tsx` — Create event
- [ ] `app/(admin)/events/[eventId]/index.tsx` — Event dashboard
- [ ] `app/(admin)/events/[eventId]/registrations.tsx` — Registrant list
- [ ] `app/(admin)/events/[eventId]/import.tsx` — CSV import wizard
- [ ] `app/(admin)/events/[eventId]/seating.tsx` — Tier + section config

### Phase 3 — QR Generation & Ticket Dispatch (Day 5–6)
- [ ] `functions/src/qr.ts` — AES-256 token generation
- [ ] `functions/src/notify.ts` — SendGrid + Twilio dispatch
- [ ] `public-ticket/index.html` — Full QR display page
- [ ] `app/(admin)/events/[eventId]/send-tickets.tsx` — Dispatch UI

### Phase 4 — QR Scanner & Check-in (Day 8–10)
- [ ] `app/(volunteer)/_layout.tsx` — Volunteer tabs
- [ ] `app/(volunteer)/scan.tsx` — Native QR scanner
- [ ] `app/(volunteer)/checkin.tsx` — Check-in confirmation + fractional group logic
- [ ] `app/(volunteer)/dashboard.tsx` — Live attendance
- [ ] `app/(volunteer)/lookup.tsx` — Manual name lookup
- [ ] `functions/src/checkin.ts` — Scan validation Cloud Function

---

## 🔧 Dependencies Installed

### App (`/package.json`)
- `expo` ~56.0.12
- `expo-router` ~56.2.11
- `react` 19.2.3
- `react-native` 0.85.3
- `react-native-reanimated` 4.3.1

### To Install Next (App)
```bash
npx expo install firebase expo-document-picker expo-camera expo-file-system @react-native-async-storage/async-storage
```

### Functions (`/functions/package.json`)
- `firebase-admin` ^12.1.0
- `firebase-functions` ^5.0.1
- `twilio` ^5.0.4
- `@sendgrid/mail` ^8.1.1

---

## 🌿 Firestore Collection Paths

```
/orgs/{orgId}
/orgs/{orgId}/events/{eventId}
/orgs/{orgId}/events/{eventId}/registrations/{regId}
/orgs/{orgId}/events/{eventId}/checkins/{checkinId}   ← audit log
/users/{uid}
```

**Default orgId**: `hindu-temple-stl`

---

## 🔐 Auth Flow

1. User opens app → root `_layout.tsx` checks Firebase Auth session
2. No session → redirect to `/(auth)/login`
3. User enters email → Firebase sends magic link
4. User clicks link → app deep links back → `sendSignInLinkToEmail` completes
5. Session created → fetch `/users/{uid}` for role
6. Role = `superadmin` or `eventadmin` → redirect to `/(admin)`
7. Role = `volunteer` → redirect to `/(volunteer)`

**Deep link scheme**: `htsl-events://`
**Magic link continuation URL**: `https://htsl-events.firebaseapp.com/__/auth/action`

---

## 📦 Key Files to Reference When Resuming

| File | Purpose |
|---|---|
| `/Users/garuda/Repos/Apps/RegiCheck/.env.local` | All API keys (do NOT commit) |
| `/Users/garuda/Repos/Apps/RegiCheck/lib/firebase.ts` | Firebase client init |
| `/Users/garuda/Repos/Apps/RegiCheck/context/AuthContext.tsx` | Auth state |
| `/Users/garuda/Repos/Apps/RegiCheck/app/_layout.tsx` | Root navigation guard |
| `/Users/garuda/Repos/Apps/RegiCheck/functions/src/index.ts` | Cloud Functions entry |
| `/Users/garuda/Repos/Apps/RegiCheck/README.md` | Full architecture + setup |

---

## 🧠 Resume Instructions

When picking up this project in a new session:
1. Read this file (`BUILD_CONTEXT.md`) first
2. Check the **Build Progress** section for `[ ]` unchecked items
3. The first unchecked item in each phase is the current focus
4. Check `lib/firebase.ts` and `context/AuthContext.tsx` for the current integration state
5. Run `npx expo start` to verify the app still boots before adding new code
