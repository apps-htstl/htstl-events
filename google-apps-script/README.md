# Priest Sankalpam View — Google Apps Script backend

The priest view reads/writes the **destination Google Sheet** through a small
Apps Script Web App. No server needs to be deployed anywhere — the script runs
on Google's infrastructure with the deploying account's edit rights.

- **Sources (read-only):** the two registration spreadsheets (IDs configured in
  `priest-sankalpam.gs`).
  - Registrations: people registered for specific events/dates.
  - Sponsors: roster of people who can attend any event/date.
- **Destination (read/write):** spreadsheet `11PV2KgpURj_w1erhuzBdMcaM5nlaEuPE8YvPgHPkOAI`.
  Only its `sponsor_completions` ledger is written. Source rows are read live
  and are never edited or duplicated into the destination.

## Behaviour

| App action | What the script does |
|---|---|
| Page load | Reads both source sheets live, merges completion history, and returns all records. |
| ✓ Done (registration) | Adds one idempotent completion for that registration's event and date. |
| ✓ Done (sponsor) | Adds one completion for the selected event and date. The sponsor remains eligible everywhere else. |
| ⟳ Sync | Re-reads both sources and the completion ledger. Newly added source rows appear immediately. |

## Deploy (one time, ~2 minutes)

1. Open the **destination sheet** with an account that can edit it.
2. **Extensions → Apps Script** — a script editor opens.
3. Replace the contents of `Code.gs` with all of [`priest-sankalpam.gs`](./priest-sankalpam.gs), then save.
4. **Deploy → New deployment** → gear icon → type **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
5. Click **Deploy**, authorize the permissions prompt, and copy the
   **Web app URL** (ends in `/exec`).
6. Put that URL in `.env`:

   ```
   EXPO_PUBLIC_SANKALPAM_API="https://script.google.com/macros/s/…/exec"
   ```

7. Restart `expo start` (env vars are baked in at build time). For the live
   site, rebuild + redeploy (`npm run deploy:web`).

## Updating the script later

Editing the code is not enough — you must publish a new version:
**Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy.**
The `/exec` URL stays the same.

`EXPO_PUBLIC_SANKALPAM_API` is required — the priest view shows a
configuration error if it is missing.
