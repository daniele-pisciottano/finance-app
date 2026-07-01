# Cattura automatica delle spese dalle notifiche (Android)

Flusso:

```
Notifica banca (Intesa / Revolut / PayPal)
   → [MacroDroid: "Notification Received"]
   → POST a  https://<tuo-dominio>.vercel.app/api/ingest
   → bozza scritta su Supabase
   → l'app la mostra in "Da confermare": tu controlli e confermi
```

Le bozze **non** entrano nelle statistiche né nel CSV finché non le confermi.

---

## 1. Configura l'endpoint (variabili su Vercel)

Vercel → progetto → **Settings → Environment Variables** (ambiente **Production**). Aggiungi
(questi **non** hanno il prefisso `VITE_`, così restano solo lato server):

| Variabile | Dove trovarla |
|---|---|
| `INGEST_SECRET` | inventane una lunga a caso (es. 32 caratteri). La userai anche sul telefono. |
| `SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** (⚠️ segreta, mai nel browser) |
| `INGEST_USER_ID` | Supabase → **Authentication → Users** → clicca il tuo utente → *User UID* |

Poi **Redeploy**.

### Verifica veloce delle variabili (dal browser)

Apri nel browser: `https://<tuo-dominio>.vercel.app/api/ingest`
Risposta attesa: `{"ok":true,"env":{"INGEST_SECRET":true,"SUPABASE_URL":true,"SUPABASE_SERVICE_ROLE_KEY":true,"INGEST_USER_ID":true}}`.
Se qualche valore è `false`, quella variabile manca (aggiungila su Vercel e fai **Redeploy**).

### Test veloce dell'endpoint (dal PC)

```bash
curl -X POST https://<tuo-dominio>.vercel.app/api/ingest \
  -H "x-ingest-secret: IL_TUO_SECRET" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data-urlencode "app=Intesa Sanpaolo Mobile" \
  --data-urlencode "text=Hai pagato 12,50 € con la carta *2896 il 30.06 alle ore 22:35 da LIDL VIA ROMA."
```

Risposta attesa: `{"ok":true,"amount":12.5,"merchant":"LIDL VIA ROMA","source":"intesa"...}`.
Apri l'app: la bozza LIDL deve comparire in **Da confermare** (eventualmente *Sincronizza ora*).

---

## 2. Automazione sul telefono (MacroDroid)

Installa **MacroDroid** (gratis) e dàgli il permesso di **accesso alle notifiche**.
Crea **una macro per ciascuna app** (o una sola con più trigger):

**Trigger** → *Notification Received*
- App: seleziona **Intesa Sanpaolo Mobile** (poi ripeti per Revolut e PayPal).

**Action** → *HTTP Request*
- Metodo: **POST**
- URL: `https://<tuo-dominio>.vercel.app/api/ingest`
- Header: aggiungi `x-ingest-secret` = `IL_TUO_SECRET`
- Content type: **application/x-www-form-urlencoded** (evita problemi con virgolette/apici nel testo)
- Body (usa le "magic text" di MacroDroid):
  ```
  app=[notification_app]&title=[notification_title]&text=[notification_text]
  ```

> `title` è importante per **Revolut**, che mette l'esercente nel titolo della notifica.
> Il ÷2 di Revolut e l'avviso doppione PayPal/Intesa sono gestiti in automatico.

**Tasker** (alternativa): Profilo *Event → Notification*, poi *Net → HTTP Request* con gli stessi
campi e le variabili `%evtprm()` / `%NTITLE` / `%NTEXT`.

---

## 3. Uso quotidiano

1. Paghi qualcosa → arriva la notifica della banca.
2. In pochi secondi la spesa compare nell'app in **Da confermare** (già con importo, esercente e
   categoria ipotizzata).
3. Apri, correggi se serve, **Conferma**. Fine.

Se non hai (ancora) l'automazione, puoi usare **"Aggiungi da notifica"** nella card *Da confermare*:
incolli il testo della notifica e crei la bozza a mano.

### Note
- **Revolut**: importo sempre diviso per 2 (conto cointestato).
- **PayPal + Intesa**: se una spesa PayPal viene poi riaddebitata da Intesa, l'app segnala il
  possibile doppione — elimini quella di troppo.
- La data della bozza è quella di ricezione della notifica; se serve la cambi in fase di conferma.
