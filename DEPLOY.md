# ProspectAI Deployment Guide
## Kein Terminal nötig. Nur klicken und copy-pasten.

**Was du brauchst:** ~30 Minuten + deine API Keys (Liste weiter unten)

---

## Übersicht: Was wo läuft

| Dienst | Was es macht | Kosten |
|---|---|---|
| **GitHub** | Speichert deinen Code | Kostenlos |
| **Railway** | Lässt Backend + Datenbank laufen | ~$10–15/Monat |
| **Vercel** | Hostet dein Dashboard (Website) | Kostenlos |

---

## Schritt 1: Code auf GitHub hochladen (10 Min)

1. Gehe zu **github.com** → Account erstellen (falls noch nicht vorhanden)
2. Klicke oben rechts auf **"+"** → **"New repository"**
3. Name: `prospectai` → **"Create repository"** klicken
4. Auf der nächsten Seite: Klicke auf **"uploading an existing file"**
5. Ziehe den gesamten `prospectai`-Ordner von deinem Computer in das Upload-Fenster
6. Klicke **"Commit changes"**

✅ Du siehst jetzt alle Dateien auf GitHub.

---

## Schritt 2: Datenbank auf Railway erstellen (5 Min)

1. Gehe zu **railway.app** → **"Login"** → **"Login with GitHub"**
2. Klicke **"New Project"**
3. Klicke **"Provision PostgreSQL"**
4. Warte ~30 Sekunden bis die Datenbank grün wird
5. Klicke auf den PostgreSQL-Block → Tab **"Connect"**
6. Kopiere die **"Postgres Connection URL"** (sieht aus wie `postgresql://postgres:...@...railway.app/railway`)
7. Speichere diese URL — du brauchst sie in Schritt 3

✅ Datenbank läuft. Das System erstellt alle Tabellen automatisch beim ersten Start.

---

## Schritt 3: Backend auf Railway deployen (10 Min)

1. Im selben Railway-Projekt: Klicke **"+ New"** → **"GitHub Repo"**
2. Wähle dein `prospectai` Repository aus
3. Railway startet automatisch den Build (dauert 2–3 Minuten)
4. Klicke auf den neuen Service-Block → Tab **"Variables"**
5. Klicke **"+ New Variable"** und trage folgende Keys ein:

```
DATABASE_URL         = (die URL aus Schritt 2)
ANTHROPIC_API_KEY    = sk-ant-...
SEARCHLEADS_API_KEY  = ...
INSTANTLY_API_KEY    = ...
APIFY_API_KEY        = ...
REDDIT_CLIENT_ID     = ...          (nur wenn Reddit aktiviert)
REDDIT_CLIENT_SECRET = ...          (nur wenn Reddit aktiviert)
SECRET_KEY           = (ein langes zufälliges Passwort, z.B. 32 zufällige Buchstaben)
ALLOWED_ORIGINS      = https://DEINE-VERCEL-URL.vercel.app,http://localhost:3000
```

> Hinweis: `ALLOWED_ORIGINS` trägst du nach Schritt 4 nach — du kennst die Vercel-URL dann.

6. Tab **"Settings"** → Abschnitt **"Domains"** → **"Generate Domain"**
7. Kopiere die generierte URL (z.B. `prospectai-backend.up.railway.app`)

✅ Backend deployed. Grüner Status-Kreis = alles läuft.

**Test:** Öffne `https://DEINE-RAILWAY-URL/health` im Browser → du siehst `{"status":"ok"}`

---

## Schritt 4: Frontend auf Vercel deployen (5 Min)

1. Gehe zu **vercel.com** → **"Sign Up"** → **"Continue with GitHub"**
2. Klicke **"Add New Project"** → wähle `prospectai`
3. Bei **"Root Directory"**: klicke **"Edit"** → wähle `frontend`
4. Aufklappen: **"Environment Variables"** → trage ein:
   ```
   NEXT_PUBLIC_API_URL = https://DEINE-RAILWAY-URL (aus Schritt 3)
   ```
5. Klicke **"Deploy"**
6. Kopiere die Vercel-URL (z.B. `prospectai.vercel.app`)

7. Zurück zu Railway → dein Backend Service → **"Variables"**
   - `ALLOWED_ORIGINS` aktualisieren: `https://prospectai.vercel.app,http://localhost:3000`
   - Railway restartet automatisch

✅ Website läuft unter deiner Vercel-URL.

---

## Schritt 5: Ersten Workspace anlegen (2 Min)

1. Öffne deine Vercel-URL im Browser
2. Gehe zu `/onboarding`
3. Fülle das 5-Schritt Formular aus:
   - Business-Profil (Name, Website, was du verkaufst)
   - ICP (Zielkunde: Branche, Größe, Jobtitel)
   - Ton & Stil (Seed-Templates auswählen)
   - Sending Account (Instantly API Key + Campaign ID)
   - Launch
4. Dashboard öffnet sich → System läuft automatisch

---

## Wo bekommst du die API Keys?

| Key | Wo du ihn findest |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → "API Keys" |
| `SEARCHLEADS_API_KEY` | Dein SearchLeads Account → Dashboard → API |
| `INSTANTLY_API_KEY` | app.instantly.ai → Settings → API |
| `APIFY_API_KEY` | console.apify.com → Settings → Integrations → API Token |
| `REDDIT_CLIENT_ID/SECRET` | reddit.com/prefs/apps → "Create Application" → Script |

---

## Was passiert automatisch nach dem Setup?

| Wann | Was |
|---|---|
| Alle 4 Stunden | Neue Leads sourced, recherchiert, bewertet, personalisiert → an Instantly gesendet |
| Jede Stunde | Performance-Daten von Instantly synchronisiert |
| Täglich um Mitternacht | Optimizer analysiert Performance und verbessert Prompts automatisch |
| Alle 30 Minuten | Reddit-Monitor (wenn aktiviert) |

Du musst nichts tun — außer das Dashboard beobachten und Ergebnisse prüfen.

---

## Häufige Probleme

**Railway zeigt roten Status / Build schlägt fehl:**
→ Tab "Deployments" → auf den Fehler klicken → Log lesen → meistens fehlt ein API Key in Variables

**Frontend zeigt "Cannot connect to API":**
→ Prüfe ob `NEXT_PUBLIC_API_URL` in Vercel korrekt ist (keine Slash am Ende!)
→ Prüfe ob deine Vercel-URL in `ALLOWED_ORIGINS` bei Railway steht

**Datenbank-Fehler beim ersten Start:**
→ Das System erstellt Tabellen automatisch — wenn es beim ersten Mal fehlschlägt, redeploye einfach bei Railway (Tab "Deployments" → "Redeploy")

**Keine Leads kommen:**
→ Dashboard → Campaigns → "Run Pipeline" manuell klicken
→ Tab "Logs" in Railway prüfen auf Fehlermeldungen

---

## Monatliche Kosten (Schätzung)

| Bei 100 Leads/Tag | Bei 300 Leads/Tag |
|---|---|
| ~$150–200/Monat | ~$350–450/Monat |

Railway-Kosten: ~$15. Rest sind API-Kosten (Claude, SearchLeads, Apify, Instantly).
