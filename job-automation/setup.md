# Job Automation Stack — Native Windows Setup Guide

**Cost: $0/mo**

## ✅ Prerequisites — Already Installed

| Tool | Version | Status |
|------|---------|--------|
| Node.js | v24.14.0 | ✅ Installed |
| n8n | v2.18.5 | ✅ Installed globally |
| Ollama | Latest | ✅ Installed at `C:\Users\om\AppData\Local\Programs\Ollama\ollama.exe` |
| Python | 3.11.15 | ✅ Installed |

## Step 1: Pull Ollama Model

```bash
# Make sure Ollama is running (check system tray)
# Then pull the model (only needed once, ~2GB)
ollama pull llama3.2
```

## Step 2: Start n8n

```bash
# Start n8n with SQLite (no database server needed)
n8n start
```

Open **http://localhost:5678** and create your admin account.

## Step 3: Set Up Credentials in n8n

### Adzuna API (free)
n8n UI → Credentials → Add Credential → Search "HTTP Request"
- Name: `Adzuna API`
- Auth: `Header Auth`
- Header Name: `Authorization`
- Header Value: Generate with:
  ```bash
  echo -n "YOUR_APP_ID:YOUR_API_KEY" | base64
  # Then prefix with "Basic "
  ```

### Google Sheets (free)
n8n UI → Credentials → Add Credential → Search "Google Sheets"
- Create a Google Cloud project → Enable Sheets API
- Create Service Account → Download JSON key
- Share your sheet with the service account email

## Step 4: Create Google Sheet

One spreadsheet with 3 tabs:

**Tab: `Raw Jobs`** — `source_id | source | title | company | location | country | salary_min | salary_max | currency | description | application_url | application_type | posted_at | discovered_at`

**Tab: `Enriched Jobs`** — `source_id | source | title | company | location | country | salary_min | salary_max | currency | description | application_url | posted_at | required_years_experience | required_skills | preferred_skills | education_required | seniority | is_remote | remote_policy | has_visa_sponsorship | benefits | industry | summary`

**Tab: `Matched Jobs`** — `source_id | company | title | location | country | match_score | match_action | seniority | summary | matching_skills | missing_skills | application_url | posted_at | matched_at | status | notes`

Sheet ID is in the URL: `https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit`

## Step 5: Import Workflows

n8n UI → Workflows → Import from File:

1. `workflows/1-job-discovery.json`
2. `workflows/2-job-enrichment.json`
3. `workflows/3-resume-matching.json`

In each workflow, replace `YOUR_GOOGLE_SHEET_ID` with your actual sheet ID and select the correct credentials.

## Step 6: Customize Resume (Workflow 3)

Open Workflow 3 → Find "Load Resume & Score" code node → Replace the hardcoded resume data with YOUR info.

## Step 7: Test & Activate

Run each workflow manually, then toggle to **Active**:

| Workflow | Schedule |
|----------|----------|
| 1 - Job Discovery | Every 6 hours |
| 2 - Job Enrichment | Every 30 min (5 jobs/cycle) |
| 3 - Resume Matching | Every 30 min |
