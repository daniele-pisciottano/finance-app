# Login + sincronizzazione con Supabase

L'app funziona in due modalità:

- **Senza chiavi Supabase** → tutto locale nel browser (come prima), nessun login.
- **Con chiavi Supabase** → login con email/password e sincronizzazione dei dati tra
  telefono, PC e altri dispositivi. L'app resta comunque **local-first**: continua a
  funzionare offline e sincronizza quando torna online.

L'export CSV/JSON continua a funzionare identico in entrambe le modalità.

## 1. Crea il progetto Supabase (gratis)

1. Vai su https://supabase.com → **Start your project** → accedi.
2. **New project**: scegli un nome (es. `finance-app`), una password del database
   (salvala) e una region vicina (es. *West EU*). Crea il progetto (1-2 min).

## 2. Crea la tabella e le regole di sicurezza

1. Nel progetto: menu a sinistra → **SQL Editor** → **New query**.
2. Incolla tutto il contenuto del file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Premi **Run**. Deve dire *Success*. (Crea la tabella `records` con Row Level Security:
   ogni utente vede solo i propri dati.)

## 3. Prendi URL e chiave pubblica

1. Menu → **Project Settings** (l'ingranaggio) → **API**.
2. Copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

> La chiave `anon` è pensata per stare nel front-end: l'accesso è protetto dalle regole RLS.
> Non usare mai la chiave `service_role` nell'app.

## 4. Configura le variabili d'ambiente

**In locale:** crea un file `.env` nella cartella del progetto (copia da `.env.example`):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Poi riavvia `npm run dev`.

**Su Vercel:** progetto → **Settings** → **Environment Variables** → aggiungi le stesse
due variabili (per Production e Preview) → **Redeploy**.

## 5. Impostazioni account (email/password)

In Supabase → **Authentication** → **Providers** → **Email**: assicurati che sia abilitato.

- Se lasci attivo **"Confirm email"**, alla registrazione riceverai una mail di conferma
  da cliccare prima del primo accesso.
- Se preferisci accedere subito senza conferma (uso personale), puoi **disattivare**
  "Confirm email" nella stessa schermata.

## 6. Primo accesso e sincronizzazione

1. Apri l'app: comparirà la schermata di **login**. Registrati con email e password.
2. I dati già presenti in locale sul dispositivo vengono **caricati sul cloud** al primo
   accesso; sugli altri dispositivi, dopo il login, vengono **scaricati**.
3. In **Impostazioni → Account e sincronizzazione** trovi lo stato, il pulsante
   *Sincronizza ora* e il *logout*.

### Note

- La sincronizzazione usa "last-write-wins": in caso di modifiche allo stesso record su
  due dispositivi, vince quella più recente.
- Se prima di fare il primo login hai dati diversi su due dispositivi, dopo il login
  verranno **uniti** (non sovrascritti): potresti dover eliminare eventuali doppioni.
- Consiglio: prima del primo login fai un backup con **Impostazioni → Esporta JSON**.
