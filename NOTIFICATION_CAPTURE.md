# Cattura automatica delle spese dalle notifiche (Android)

```
Notifica banca (Intesa / Revolut / PayPal / Satispay)
   → [MacroDroid: "Notification Received"]
   → POST a  https://<tuo-dominio>.vercel.app/api/ingest?secret=<TOKEN DELLA PERSONA>
   → bozza scritta su Supabase, sull'account a cui appartiene il token
   → l'app la mostra in "Da confermare": si controlla e si conferma
```

Le bozze **non** entrano nelle statistiche né nel CSV finché non vengono confermate.

Un solo endpoint serve **più account**: il token nell'URL decide di chi è la spesa. Ogni
account ha le sue regole (quali app catturare, se dividere Revolut a metà, quali importi
segnalare come cauzione) e le sue categorie — l'endpoint non le conosce e non deve
conoscerle: salva un "tag" generico (`fuel`, `groceries`, `restaurant`…) e l'app lo
traduce nella categoria giusta per quell'account.

---

## 1. Configura l'endpoint (variabili su Vercel)

Vercel → progetto → **Settings → Environment Variables** (ambiente **Production**).
Queste **non** hanno il prefisso `VITE_`, così restano solo lato server:

| Variabile | Dove trovarla |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** (⚠️ segreta, mai nel browser) |
| `INGEST_TOKENS` | la mappa token → utente, vedi sotto |

`INGEST_TOKENS` associa un segreto a caso a ogni persona:

```
{"3f9a...daniele...b21":"11111111-1111-1111-1111-111111111111","7c4e...marta...9df":"22222222-2222-2222-2222-222222222222"}
```

- Il **token** te lo inventi tu: 32 caratteri alfanumerici, uno diverso per persona.
  Serve anche a distinguere chi manda cosa, quindi non riusare lo stesso.
- Lo **user id** è quello Supabase: **Authentication → Users** → clicca l'utente → *User UID*.
- Se le graffe ti danno noia, accetta anche la forma compatta:
  `token1:uuid1,token2:uuid2`

Poi **Redeploy**.

> La vecchia coppia `INGEST_SECRET` + `INGEST_USER_ID` continua a funzionare, quindi la
> macro già installata sul tuo telefono non si rompe. Puoi migrarla a `INGEST_TOKENS`
> quando vuoi.

### Verifica veloce (dal browser)

Apri `https://<tuo-dominio>.vercel.app/api/ingest`. Risposta attesa:

```json
{"ok":true,"env":{"SUPABASE_URL":true,"SUPABASE_SERVICE_ROLE_KEY":true,"configuredAccounts":2}}
```

`configuredAccounts` deve corrispondere al numero di persone configurate. Se è `0`,
`INGEST_TOKENS` non è scritto bene (i token veri non vengono mai mostrati).

### Test dell'endpoint (dal PC)

```bash
curl -X POST "https://<tuo-dominio>.vercel.app/api/ingest?secret=IL_TOKEN_DI_MARTA" -H "content-type: text/plain" --data-binary "Intesa Sanpaolo Mobile
LIDL
Hai pagato 12,50 € con la carta *2896 il 30.06 alle ore 22:35 da LIDL VIA ROMA."
```

Risposta attesa: `{"ok":true,"amount":12.5,"merchant":"LIDL VIA ROMA","source":"intesa","tag":"groceries"}`.
Apri l'app **con quell'account**: la bozza LIDL deve comparire in **Da confermare**
(eventualmente *Sincronizza ora*).

---

## 2. MacroDroid sul telefono — il recap

Da rifare **identico su ogni telefono**, cambiando solo il token nell'URL.

### 2.1 Preparazione (una volta per telefono)

1. Play Store → installa **MacroDroid** (la versione gratuita basta: il limite di 5 macro
   non ci tocca, ne serve **una**).
2. Aprila → accetta i permessi iniziali.
3. **Permesso notifiche**: MacroDroid lo chiede da solo al primo trigger, ma conviene darlo
   subito — Impostazioni Android → *App* → *Accesso alle notifiche* → attiva **MacroDroid**.
   Senza questo non arriva niente e non c'è nessun errore visibile.
4. **Batteria**: Impostazioni Android → *Batteria* → *Ottimizzazione batteria* → MacroDroid →
   **Non ottimizzare**. È il motivo numero uno per cui le macro smettono di funzionare dopo
   qualche giorno.

### 2.2 La macro

**Aggiungi macro** → dai un nome (es. "Spese → Finance App").

**Trigger** → *Applicazioni* → **Notifica ricevuta** (*Notification Received*)
- **Applicazioni**: seleziona tutte quelle che servono a questa persona, in un unico trigger.
  Per Marta: **Revolut**, **Satispay**, **PayPal**.
  Per te: **Intesa Sanpaolo Mobile**, **Revolut**, **PayPal**.
- Lascia vuoto il filtro sul testo: a scartare le notifiche che non sono pagamenti
  (premi, referral, avvisi di login, saldo) ci pensa il server.

**Azione** → *Connettività* → **Richiesta HTTP** — configurazione **a prova di errore**
(niente header, niente form):
- Metodo: **POST**
- URL — il token va **qui**, è alfanumerico e passa senza problemi:
  ```
  https://<tuo-dominio>.vercel.app/api/ingest?secret=IL_TOKEN_DI_QUESTA_PERSONA
  ```
- Content type: **text/plain**
- **NON** aggiungere header personalizzati (era `x-ingest-secret` a dare errore).
- Corpo — **3 righe**, con le "magic text" di MacroDroid (il pulsante `{ }` accanto al campo):
  ```
  [notification_app]
  [notification_title]
  [notification_text]
  ```

**Vincoli**: nessuno. Salva.

> Perché così: MacroDroid non URL-codifica il corpo e gestisce male gli header, quindi
> form-urlencoded + header davano errori. Token nell'URL + corpo di testo = zero problemi.
> La 2ª riga (il titolo) è quella che conta per **Revolut** e **Satispay**, che mettono
> l'esercente lì; per Revolut è anche dove compare la scritta **Joint** dei conti
> cointestati.

### 2.3 Prova sul telefono

In MacroDroid la macro ha un pulsante **Test azioni**: lo puoi usare, ma manda righe vuote.
La prova vera è fare un pagamento piccolo (un caffè) e controllare che entro pochi secondi
la bozza compaia nell'app.

Se non arriva niente:
1. MacroDroid → **Log di sistema** (menu ☰ → *Log*): vedi se il trigger è scattato e cosa ha
   risposto la richiesta HTTP.
2. `401 Unauthorized` → il token nell'URL non è in `INGEST_TOKENS` (o manca il Redeploy).
3. Trigger che non scatta → manca l'accesso alle notifiche, o l'app della banca non è
   selezionata nel trigger.
4. Tutto ok ma la bozza non si vede → nell'app, *Impostazioni → Account e sincronizzazione →
   Sincronizza ora*.

### 2.4 Tasker (alternativa)

Profilo *Event → Notification*, poi *Net → HTTP Request*, stesso URL con `?secret=...`,
body di 3 righe con `%NTITLE` e `%NTEXT` (e il nome dell'app).

---

## 3. Regole per account (Impostazioni → Cattura automatica dalle notifiche)

Queste stanno **nell'app**, non su Vercel: ogni persona le imposta per sé e viaggiano con
l'account.

- **App da catturare** — spegni una fonte quando quelle spese sono già coperte in altro
  modo. Esempio: PayPal, se quei pagamenti sono tutti ricorrenti già registrati come regole.
  Una fonte spenta viene scartata sul server: non arriva nemmeno in "Da confermare".
- **Revolut: dividi a metà** —
  - *Solo sul conto cointestato* (default): l'app dimezza **solo** le notifiche il cui titolo
    inizia con "Joint", e registra per intero i pagamenti personali sulla stessa carta.
  - *Sempre*: comportamento storico, ogni pagamento Revolut viene dimezzato.
  - *Mai*: nessuna divisione.
- **Importi da segnalare come cauzione** — precompilato con **103,29 €**, il blocco che i
  distributori di benzina mettono sulla carta e che poi rilasciano. Una bozza con questo
  importo resta in "Da confermare" con un avviso ben visibile: la elimini invece di
  registrarla. Non viene mai scartata in automatico, così se quella cifra è una spesa vera
  la puoi confermare lo stesso. Il controllo guarda anche l'importo **prima** dell'eventuale
  ÷2, quindi funziona anche su una carta Revolut cointestata.

---

## 4. Uso quotidiano

1. Si paga qualcosa → arriva la notifica della banca.
2. In pochi secondi la spesa compare in **Da confermare**, già con importo, esercente e
   categoria ipotizzata.
3. Si apre, si corregge se serve, **Conferma**.

Senza automazione si può sempre usare **"Aggiungi spesa da notifica"** nella card
*Da confermare*: si incolla il testo della notifica e si crea la bozza a mano.

### Note

- **PayPal + carta**: se una spesa PayPal viene poi riaddebitata dalla banca, l'app segnala
  il possibile doppione — si elimina quella di troppo.
- La data della bozza è quella di ricezione della notifica; si cambia in fase di conferma.
- La categoria proposta viene da tre fonti, in ordine: la **memoria dell'esercente** (che
  categoria hai scelto l'ultima volta in quel posto), poi il **tag** riconosciuto dal testo,
  poi niente (la scegli tu).
