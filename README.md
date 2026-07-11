# HTSL Events — Event Management Platform & Startup Guide
### Hindu Temple of St. Louis · Volunteer Operations App

This repository contains the architecture, data models, setup checklists, and the 2-week implementation plan for **RegiCheck**. 

Use this document as a master reference to set up the development environment, configure external services, initialize the codebase, and execute the migration from your development environment to the final production Google Cloud / Firebase account.

---

## 📖 Table of Contents
1. [System Architecture & Tech Stack](#1-system-architecture--tech-stack)
2. [Local Development Environment Setup](#2-local-development-environment-setup)
3. [Cloud Services Account Checklist](#3-cloud-services-account-checklist)
4. [Firebase Project Initial Configuration](#4-firebase-project-initial-configuration)
5. [EAS / Expo Account Setup](#5-eas--expo-account-setup)
6. [Twilio SMS & SendGrid Setup](#6-twilio-sms--sendgrid-setup)
7. [Environment Variables & Secret Strategy](#7-environment-variables--secret-strategy)
8. [Data Models & Seating Schema](#8-data-models--seating-schema)
9. [2-Week Step-by-Step Implementation Plan](#9-2-week-step-by-step-implementation-plan)
10. [Environment Migration Checklist (Demo → Production)](#10-environment-migration-checklist-demo--production)
11. [Open Questions / Design Decisions](#11-open-questions--design-decisions)

---

## 1. System Architecture & Tech Stack

RegiCheck is built as a **single React Native (Expo) app** serving all roles (Super Admins, Event Admins, and Volunteers) through a role-based navigation flow. This avoids maintaining separate codebases and pipelines. The only web surface is a static HTML page hosted on Firebase Hosting that attendees open via their ticket links to view their QR code.

```
┌─────────────────────────────────────────────────────┐
│           RegiCheck — Expo (React Native)           │
│                                                     │
│  ADMIN ROLE SCREENS    │  VOLUNTEER ROLE SCREENS    │
│  ─────────────────     │  ────────────────────      │
│  • Event management    │  • QR scanner              │
│  • CSV import          │  • Check-in confirm        │
│  • Seating config      │  • Attendance dashboard    │
│  • Volunteer invite    │  • Manual lookup           │
│  • QR send dispatch    │  • Walk-in add             │
│  • Analytics           │                            │
└────────────────────────┬────────────────────────────┘
                         │ Firestore Realtime Listeners
           ┌──────────────▼──────────────────────────┐
           │            Firebase Backend             │
           │  Firestore │ Auth │ Storage │ Functions │
           └──────────────┬──────────────────────────┘
                         │
           ┌──────────────▼──────────────────────────┐
           │          External Services              │
           │    Twilio SMS     │  SendGrid Email     │
           └─────────────────────────────────────────┘
                         │
           ┌──────────────▼──────────────────────────┐
           │   Firebase Hosting (static, free)       │
           │   regicheck.web.app/ticket/{id}         │
           │   Attendee opens this link → sees QR   │
           └─────────────────────────────────────────┘
```

### Tech Stack Choices

| Layer | Choice | Notes |
|---|---|---|
| **App Framework** | Expo SDK 51 (React Native) | Single app, unified role management |
| **Navigation** | Expo Router (file-based) | Role-based tab layout with redirect guards |
| **Styling** | NativeWind (Tailwind CSS for RN) | Consistent layout and styling |
| **Database** | Firebase Firestore | Real-time listeners and offline cache out of the box |
| **Auth** | Firebase Auth (Magic Links) | Passwordless, invite-only login |
| **Storage** | Firebase Storage | Temporary storage for CSV uploads |
| **Backend** | Firebase Cloud Functions | Node.js environment to handle Twilio, SendGrid, and QR generation |
| **QR Scanning** | `react-native-vision-camera` + MLKit | Fast, native scanning with camera support |
| **QR Display** | `react-qr-code` | SVG-based QR display in-app and on the static ticket web page |
| **Email Delivery** | SendGrid | Delivery of ticket links to attendees (primary/fallback) |
| **SMS Delivery** | Twilio SMS API | Automated ticket notification via regular SMS messages |
| **Build & Deploy** | EAS Build (Expo) | Cloud builds and TestFlight distribution |

---

## 2. Local Development Environment Setup

Complete these installations on your local machine before starting the codebase.

### 2.1 Node.js
Ensure you are running Node.js **v18** or **v20 LTS**:
```bash
# Check version
node --version

# If not installed, use nvm to install
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

### 2.2 Xcode (macOS only — for iOS simulator)
1. Install **Xcode** from the macOS App Store (approx. 15 GB).
2. Install command line tools:
   ```bash
   xcode-select --install
   ```

### 2.3 Global CLI Tools
Install the necessary CLI helpers:
```bash
# Expo CLI and EAS Build CLI
npm install -g eas-cli expo-cli

# Firebase CLI
npm install -g firebase-tools

# Verify installations
eas --version
firebase --version
```

### 2.4 Physical Testing Device
Since the iOS Simulator does not support camera capture, you need a physical iOS device to test the QR scanner.
1. Download **Expo Go** from the App Store on your test iPhone.
2. Sign in with the same Expo account you create below.

---

## 3. Cloud Services Account Checklist

Create the following accounts. During development, you will connect them to a **demo/sandbox** profile. When migrating to production, you will create counterparts under the temple's official organization accounts.

| Service | Dev Setup (Demo) | Prod Setup (Temple Org) | Cost Profile |
|---|---|---|---|
| **Google Cloud / Firebase** | Personal Google account | Temple's Google Org | Free Spark plan, Blaze upgrade for Functions (mostly free usage) |
| **Expo / EAS** | Personal Expo Account | Temple Org Account | Free tier covers standard builds |
| **Twilio** | Developer Trial account | Paid account (Toll-Free or A2P 10DLC) | ~$20 for development. SMS message costs apply per event |
| **SendGrid** | Personal Free account | Official verified sender domain account | Free tier (100 emails/day) |
| **Apple Developer** | Developer enrollment | Org enrollment ($99/year) | $99/year (required for TestFlight distribution) |

---

## 4. Firebase Project Initial Configuration

Create the Firebase project that will act as the development database backend.

1. **Create Project**: Go to [console.firebase.google.com](https://console.firebase.google.com) → click **Add project** → Name it `regicheck-demo` (disable Google Analytics).
2. **Enable Firestore Database**: 
   * Navigate to **Build → Firestore Database** → click **Create database**.
   * Choose **Start in test mode** (security rules will be deployed via code later).
   * Location: Select `us-central1` (or your preferred local US region).
3. **Enable Firebase Authentication**:
   * Navigate to **Build → Authentication** → click **Get started**.
   * Go to the **Sign-in method** tab and enable **Email/Password**.
   * Under the Email sign-in configuration, toggle **Email link (passwordless sign-in)** to **Enabled** and click **Save**.
4. **Enable Firebase Storage**:
   * Navigate to **Build → Storage** → click **Get started** → Start in **test mode** → Select region matching Firestore (`us-central1`).
5. **Enable Firebase Functions (Blaze Plan)**:
   * Navigate to **Build → Functions** → click **Upgrade project** to the Blaze (Pay-as-you-go) plan.
   * *Note: Firebase Cloud Functions require billing enabled. You will remain within the free tier (first 2M invocations/month free) during development.*
6. **Enable Secret Manager API**:
   * Open the Google Cloud Console for your project at [console.cloud.google.com](https://console.cloud.google.com).
   * Search for **Secret Manager API** and click **Enable**. This allows Cloud Functions to securely access environment secrets like Twilio and SendGrid tokens.
7. **Download Service Account Key**:
   * Go to **Project Settings** (gear icon) → **Service accounts** tab.
   * Click **Generate new private key** and download the resulting JSON file. 
   * Rename it to `service-account-demo.json` and place it in the root folder. **DO NOT commit this file to git.**

---

## 5. EAS / Expo Account Setup

To compile binary builds of your app and distribute them to volunteers via TestFlight, configure your Expo account.

1. **Sign Up**: Register a profile on [expo.dev](https://expo.dev).
2. **CLI Login**: Open a terminal and run:
   ```bash
   eas login
   ```
3. **Link to Project**: Inside the root folder, running `eas project:init` will tie your codebase directory to your Expo account.

---

## 6. Twilio SMS & SendGrid Setup

Configure the notification delivery channels for sending QR ticket links.

### 6.1 SendGrid (Email Fallback / Secondary Delivery)
1. Register on [sendgrid.com](https://sendgrid.com) for a free account.
2. Navigate to **Settings → API Keys** → Click **Create API Key** with **Full Access**. Save the key (`SG.xxx`).
3. Navigate to **Settings → Sender Authentication** and complete **Single Sender Verification** using a developer email address. For production, you will configure **Domain Authentication** using the temple's DNS records.

### 6.2 Twilio SMS Setup
Setting up SMS is faster than WhatsApp because it completely bypasses Meta Business verification (`business.facebook.com`).

* **Task 1: Setup Twilio Account**
  * Register on [twilio.com](https://twilio.com). Save your **Account SID** and **Auth Token** from the Dashboard console.
  * During trial/development, you can send SMS immediately to verified caller IDs (your own registered developer number).

* **Task 2: Buy a Twilio Phone Number**
  * In the Twilio Console, navigate to **Develop → Phone Numbers → Manage → Buy a number**.
  * Search for a US local or Toll-Free number. A **Toll-Free number** is highly recommended for non-profits as they cost only $2.00/month and have a straightforward verification process.

* **Task 3: Toll-Free Verification or A2P 10DLC Registration**
  * **Toll-Free Verification (Recommended):** Submit the free verification form in the Twilio Console (takes 1-3 business days). This ensures carriers do not filter or block your transactional ticket messages.
  * **A2P 10DLC Registration:** If you prefer a local 10-digit number, register your brand and campaign in the Twilio console.

---

## 7. Environment Variables & Secret Strategy

To guarantee that you can push the codebase to a public repository and easily swap databases later, **no secret configurations are committed to git**.

### 7.1 Local Configuration (`.env.local`)
Create a `.env.local` file at the root of the workspace. This file is gitignored.

```bash
# ─── Firebase Config (Safe for client representation) ─────────────────────────
EXPO_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="regicheck-demo.firebaseapp.com"
EXPO_PUBLIC_FIREBASE_PROJECT_ID="regicheck-demo"
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="regicheck-demo.appspot.com"
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="000000000000"
EXPO_PUBLIC_FIREBASE_APP_ID="1:000000000000:web:abc12345"

# ─── Org / Event Application Config ─────────────────────────────────────────
EXPO_PUBLIC_ORG_ID="hindu-temple-stl"
EXPO_PUBLIC_ORG_NAME="Hindu Temple of St. Louis"
EXPO_PUBLIC_MAX_PARTY_SIZE=20
EXPO_PUBLIC_TICKET_BASE_URL="https://regicheck-demo.web.app/ticket"
EXPO_PUBLIC_ENABLE_SMS=true # Toggle sending SMS notifications
```

### 7.2 EAS Secrets & Server Secrets
These credentials are set on the build servers and in Firebase Secret Manager, never in code:

* **EAS Cloud Secrets**: Set these via terminal for Expo builds:
  ```bash
  eas secret:create --scope project --name TWILIO_ACCOUNT_SID --value "ACxxx"
  eas secret:create --scope project --name TWILIO_AUTH_TOKEN --value "your_auth_token"
  eas secret:create --scope project --name SENDGRID_API_KEY --value "SG.xxx"
  eas secret:create --scope project --name QR_ENCRYPTION_SECRET --value "your_secret_key"
  ```
* **Firebase Cloud Functions Secrets**: Deploy these to keep them secure in Cloud Functions:
  ```bash
  firebase functions:secrets:set TWILIO_ACCOUNT_SID
  firebase functions:secrets:set TWILIO_AUTH_TOKEN
  firebase functions:secrets:set SENDGRID_API_KEY
  firebase functions:secrets:set QR_ENCRYPTION_SECRET
  ```

### 7.3 QR Key Generation
Generate the encryption secret key once. If you regenerate this secret while an event registration is active, existing QR codes will become unscannable.
```bash
# Run this once in a terminal to create a 32-character hex key
openssl rand -hex 16
```
Save the output key to your password manager and assign it to the `QR_ENCRYPTION_SECRET` environment variable.

---

## 8. Data Models & Seating Schema

Below is the Firestore document structure deployed to organize registration data and dynamically assign sections based on tiers.

### Collection: `/orgs/{orgId}`
Contains general metadata for the organization.
```json
{
  "name": "Hindu Temple of St. Louis",
  "timezone": "America/Chicago",
  "contactEmail": "volunteers@htsl.org",
  "contactPhone": "+13145550199"
}
```

### Collection: `/orgs/{orgId}/events/{eventId}`
Tracks event configurations. Seating limits are configured dynamically as soft capacities.
```json
{
  "name": "Ganesha Chaturthi 2026",
  "date": "2026-09-15T18:00:00Z",
  "venue": "Main Temple Hall",
  "status": "active", // draft | active | closed
  "tiers": [
    { "id": "t1", "name": "Platinum Sponsor", "color": "#A855F7", "sectionIds": ["s1"] },
    { "id": "t2", "name": "Gold Sponsor", "color": "#F59E0B", "sectionIds": ["s2"] },
    { "id": "t3", "name": "Silver Sponsor", "color": "#94A3B8", "sectionIds": ["s3"] },
    { "id": "t4", "name": "General Public", "color": "#22C55E", "sectionIds": ["s4"] }
  ],
  "sections": [
    { "id": "s1", "name": "Rows 1-5 (Front)", "capacity": 150 },
    { "id": "s2", "name": "Rows 6-12", "capacity": 250 },
    { "id": "s3", "name": "Rows 13-20", "capacity": 300 },
    { "id": "s4", "name": "General Standing / Overflow", "capacity": 500 }
  ],
  "createdAt": "2026-06-15T22:30:00Z"
}
```

### Collection: `/orgs/{orgId}/events/{eventId}/registrations/{regId}`
Holds check-in credentials. UIDs must be preserved if migrating.
```json
{
  "firstName": "Aditya",
  "lastName": "Sharma",
  "email": "aditya.sharma@example.com",
  "phone": "+13145550123",
  "tier": "Gold Sponsor",
  "partySize": 4,
  "notes": "Need wheelchair access",
  "qrToken": "aes-encrypted-string-containing-meta-keys",
  "qrStatus": {
    "generated": true,
    "sentAt": "2026-06-16T10:00:00Z",
    "channel": "sms", // sms | email
    "deliveredAt": "2026-06-16T10:00:05Z"
  },
  "checkedInCount": 0, // Current checked-in count (0 to partySize)
  "checkins": [
    {
      "checkedInAt": "2026-06-16T10:00:05Z",
      "checkedInBy": "volunteerUID",
      "count": 2 // supports fractional group arrival (e.g. 2 of 4 checked in)
    }
  ]
}
```

### Collection: `/users/{uid}`
Defines permissions. A user's navigation state reacts to their designated role.
```json
{
  "displayName": "Sanjay Kumar",
  "email": "sanjay.volunteer@gmail.com",
  "role": "volunteer", // volunteer | eventadmin | superadmin
  "orgId": "hindu-temple-stl",
  "assignedEvents": ["eventId123"]
}
```

---

## 9. 2-Week Step-by-Step Implementation Plan

### ⚡ Week 1 — Core Architecture, Auth & CSV Uploads

* [ ] **Day 1: Setup & Initialization**
  * Scaffold the Expo Router application template using `npx create-expo-app@latest RegiCheck --template tabs`.
  * Run `firebase init` to configure Firestore Database, Cloud Functions, Hosting, Storage, and Emulators.
  * Install dependencies: `firebase`, `@react-native-async-storage/async-storage`, `tailwindcss`, `nativewind`, and `react-native-svg`.
  * Set up email magic-link auth handlers in the `(auth)/login` screen.

* [ ] **Day 2: Event Config & Routing Guards**
  * Code `/app/_layout.tsx` to handle authentication redirection. If a volunteer is authenticated, render the `(volunteer)` layout tab; if an admin is authenticated, render `(admin)`.
  * Build UI components to create, delete, and list events under `(admin)/events`.
  * Create `firestore.rules` containing security policies verifying roles.

* [ ] **Day 3: CSV Import Engine**
  * Build the CSV upload screen `(admin)/events/[eventId]/import.tsx`.
  * Use `expo-document-picker` to read CSV files locally. Parse content into an array using a lightweight JS parser.
  * Provide a header mapping screen to associate custom headers (e.g. `"Sponsor Tier"`) with standard Firestore columns. Show a preview table before writing records to database collections.

* [ ] **Day 4: Registrant Lookup & Seating Config**
  * Implement searching and filtering of registrants under `(admin)/events/[eventId]/registrations.tsx`.
  * Create forms to manually add or edit a registrant.
  * Implement configuration screens for admins to define sponsor tiers, link them to specific seating sections, and set capacities.

* [ ] **Day 5: QR Code Security & Verification Engine**
  * Write a Firebase Cloud Function `generateRegistrationQR` triggered when a new registrant is added. It generates an AES-256 encrypted token embedding registration keys and saves it under `qrToken`.
  * Build a static HTML site in `/public-ticket/index.html`. Attendees open this page to display a live QR code generated from their token using `react-qr-code`.
  * Deploy this file to Firebase Hosting.

* [ ] **Day 6: Automated Notifications & Fallbacks**
  * Write a Cloud Function `sendTicketNotification` that reads user options, formats message bodies, and dispatches ticket links via SendGrid email API.
  * Build an administration dashboard `(admin)/events/[eventId]/send-qr.tsx` showing delivery queues, delivery channels, and execution progress.

* [ ] **Day 7: System Review**
  * Run end-to-end integration tests using simulated import sheets to verify that records write cleanly, tokens encrypt, and emails deliver.

---

### ⚡ Week 2 — Volunteer Scanners, Attendance Dashboard & Go-Live

* [ ] **Day 8: Native Scanner Integration**
  * Integrate the camera module using `react-native-vision-camera`.
  * Build `(volunteer)/scan.tsx` to read QR tokens and request validation from a Firestore cloud function endpoint.
  * Add visual cues (scanning indicators, targeting boxes) on screen.

* [ ] **Day 9: Check-in Actions & Security Checks**
  * Code the check-in modal. Once a volunteer scans a code, load and display attendee names, sponsor status, party sizes, and seating instructions.
  * Default the check-in quantity to the remaining count (`partySize - checkedInCount`). Allow the volunteer to adjust/reduce this number if only part of the group has arrived.
  * Save check-ins to a `checkins` subcollection or array, incrementing `checkedInCount`. If `checkedInCount === partySize`, mark the registration fully checked in.
  * Create security flags: If a scanned QR token matches a registrant whose `checkedInCount >= partySize` (fully checked in), throw an alert displaying the previous check-in history.

* [ ] **Day 10: Manual Search & Offline Storage**
  * Build `(volunteer)/lookup.tsx` allowing search fallback by matching phone suffix or last name.
  * Create walk-in check-in forms allowing volunteers to add unexpected guests to the system on the fly.
  * Enable Firestore local offline persistence (`initializeFirestore(app, { localCache: persistentLocalCache() })`). Scans collected without connection queue in local storage, sync automatically once connection returns.

* [ ] **Day 11: Real-time Attendance Analytics**
  * Build the monitoring screen `(volunteer)/dashboard.tsx` tracking attendance counts.
  * Create a gauge showing occupancy per seating section. This updates in real-time as volunteers scan entries.

* [ ] **Day 12: Twilio SMS Integration**
  * Link SMS functionality inside `sendTicketNotification`. Toggle `EXPO_PUBLIC_ENABLE_SMS` to `true` to deliver tickets to users via regular SMS text messages.
  * Run `eas build --profile preview` to distribute testing builds to Apple TestFlight.

* [ ] **Day 13: Simulated Stress Tests & Buffers**
  * Conduct a trial check-in session using several physical phones. Check the performance of offline queueing by disconnecting the internet, scanning codes, and confirming synchronization.

* [ ] **Day 14: Deployment & Release**
  * Compile the final build: `eas build --profile production`.
  * Send instructions to volunteer email groups to download the app via TestFlight.
  * Run through the final Go-Live checklists.

---

## 10. Environment Migration Checklist (Demo → Production)

When you are ready to transition your system from your development environment to the temple's official production Google account, work through this checklist.

```
□  1.  Create a new Firebase Project in the temple's Google Cloud Account (e.g. htsl-regicheck-prod).
□  2.  Enable Firestore Database, Auth, Storage, Functions, and Hosting.
□  3.  Register the production Firebase alias inside the project workspace directory:
         firebase use --add  (alias name: production)
□  4.  Change terminal context:
         firebase use production
□  5.  Deploy security rules and index definitions:
         firebase deploy --only firestore:rules,firestore:indexes,storage
□  6.  Configure server secrets inside production Firebase Secret Manager (copy exact keys from development):
         firebase functions:secrets:set TWILIO_ACCOUNT_SID
         firebase functions:secrets:set TWILIO_AUTH_TOKEN
         firebase functions:secrets:set TWILIO_SMS_FROM
         firebase functions:secrets:set SENDGRID_API_KEY
         firebase functions:secrets:set QR_ENCRYPTION_SECRET  ← MUST MATCH DEVELOPMENT KEY EXACTLY!
□  7.  Deploy production Cloud Functions:
         firebase deploy --only functions
□  8.  Export Firestore data from the development demo database:
         gcloud config set project regicheck-demo
         gcloud firestore export gs://regicheck-demo.appspot.com/exports/migration-data
□  9.  Copy the export folder from development storage into the production bucket, then import:
         gcloud config set project htsl-regicheck-prod
         gcloud firestore import gs://htsl-regicheck-prod.appspot.com/imports/migration-data
□  10. Export Auth users from the development project:
         firebase use demo
         firebase auth:export users-export.json --format=json
□  11. Import those users into the production project to preserve credentials and UIDs:
         firebase use production
         firebase auth:import users-export.json
□  12. Deploy the static ticket page to production:
         firebase deploy --only hosting
□  13. Update eas.json production profile settings with the production Firebase API config keys.
□  14. Trigger the production build compiler:
         eas build --profile production
□  15. Complete a test run using one registration code: verify scans register and write to the database.
□  16. Redirect Twilio webhook endpoints to target the production Cloud Function HTTP endpoint URL.
□  17. Transition DNS verification records in SendGrid to point to production domain servers.
□  18. Send download TestFlight invitations to volunteers targeting the production build profile.
□  19. Archive and delete the development project alias after 30 days of production stability.
```

---

## 11. Open Questions / Design Decisions

Before starting development on the codebase, clarify the following requirements with the project stakeholders:

1. **App Branded Name**: Is "RegiCheck" the finalized name, or should the app be branded under a name associated with the temple (e.g., "HTSL Events", "DevaPass")?
2. **Check-In Verification Behavior**: When a volunteer scans a registration ticket representing a group registration (e.g., Party of 5), should the system automatically check in the entire party at once, or should the volunteer check in attendees individually (e.g., check-in 3 today, 2 later)?
3. **Venue Wi-Fi Availability**: How strong is the network connection at the main temple hall? Should we prioritize caching strategies for an offline-first check-in design, or is continuous internet access expected?
4. **CSV Admin Workflow**: Will admin users perform CSV uploads on a computer (via a web client interface), or will they perform uploads on mobile devices (using the document selector tool inside the React Native app)?
