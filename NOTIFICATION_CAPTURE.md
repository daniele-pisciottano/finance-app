# Cattura automatica delle spese dalle notifiche (Android)

```
Notifica banca (Intesa / Revolut / PayPal / Satispay / SMS YOUALERT)
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

**Aggiungi macro** → dai un nome (es. "Finance").

Serve **una macro con due trigger**, non uno solo. Il motivo: il filtro sul testo di un
trigger vale per **tutte** le app elencate in quel trigger. Se metti Revolut, PayPal,
Satispay e Messaggi insieme e poi filtri per "Autorizzato pagamento", passano **solo** gli
SMS della carta e tutto il resto viene buttato via prima di partire. Due trigger separati
risolvono: MacroDroid li mette in OR, basta che ne scatti uno.

#### Trigger 1 — le app di pagamento

*Applicazioni* → **Notifica Ricevuta**
- **Applicazioni**: Revolut, Satispay, PayPal (e Intesa Sanpaolo Mobile se la usi).
  **Non** mettere Messaggi qui.
- **Contenuto Testo**: **Qualsiasi**. A scartare premi, referral, avvisi di login e
  notifiche di saldo ci pensa il server.

#### Trigger 2 — l'SMS della carta (solo se usi YOUALERT)

*Applicazioni* → **Notifica Ricevuta**
- **Applicazioni**: **Messaggi** (o l'app SMS che usi), e **solo** quella.
- **Contenuto Testo**: **Contiene** → `Autorizzato pagamento`
- Lascia spuntato *Senza distinzione tra maiuscole e minuscole*.

Qui il filtro serve davvero: senza, ogni SMS che ricevi verrebbe spedito all'endpoint.
(Il server si difende comunque — una notifica non riconosciuta che arriva da un'app di
messaggistica non diventa mai una spesa, nemmeno se contiene una cifra — ma non c'è motivo
di mandare i propri SMS in giro.)

> **Android 15+**: nella schermata del trigger MacroDroid avvisa che alcuni contenuti delle
> notifiche (tipicamente gli OTP) possono essere oscurati per privacy, e in quel caso il
> trigger non scatta o arriva senza testo. Se l'SMS della carta non passa, disattiva
> **Notifiche avanzate** nelle impostazioni di notifica del telefono.

#### Azione — Richiesta HTTP

*Connettività* → **Richiesta HTTP**. Una sola azione per entrambi i trigger.

- Metodo: **POST**
- URL: `https://<tuo-dominio>.vercel.app/api/ingest`

Poi **una** delle due configurazioni qui sotto — l'endpoint le accetta entrambe.

**Variante A — header + form** (è quella che gira sul telefono di Daniele, collaudata)

| Scheda | Campo | Valore |
|---|---|---|
| *Parametri di intestazione* | `x-ingest-secret` | il token di questa persona |
| *Contenuto del corpo* | Tipo di contenuto | `application/x-www-form-urlencoded` |
| *Contenuto del corpo* | Testo | `app=[notification_app]&title=[notification_title]&text=[notification_text]` |

**Variante B — token nell'URL + testo semplice**

| Scheda | Campo | Valore |
|---|---|---|
| — | URL | `https://<tuo-dominio>.vercel.app/api/ingest?secret=IL_TOKEN` |
| *Contenuto del corpo* | Tipo di contenuto | `text/plain` |
| *Contenuto del corpo* | Testo | tre righe: nome app, titolo, testo |

Usa la B se la A dà problemi con gli header su qualche versione di MacroDroid.

> ⚠️ **Le variabili inseriscile con il pulsante `...`** accanto al campo del corpo, non
> scrivendole a mano. La sintassi cambia tra le versioni di MacroDroid — su alcune è
> `[notification_title]`, su altre `{not_title}` — e se sbagli parte il testo letterale:
> la richiesta va a buon fine, il server non trova nessun importo e scarta tutto in
> silenzio. È il modo più subdolo in cui questa configurazione può sembrare giusta e non
> funzionare. Nel menù del pulsante cerca le voci **nome app della notifica**, **titolo
> della notifica** e **testo della notifica**.

Le tre informazioni servono tutte. Il titolo in particolare: Revolut e Satispay ci mettono
l'esercente, Revolut ci scrive anche il nome del conto (da cui l'app capisce se è
cointestato), e per gli SMS è il mittente da cui viene riconosciuto YOUALERT.

**Vincoli**: nessuno. Salva.

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

- **App da catturare** — Intesa, Revolut, PayPal, Satispay, YOUALERT. Spegni una fonte
  quando quelle spese sono già coperte in altro modo. Esempio: PayPal, se quei pagamenti
  sono tutti ricorrenti già registrati come regole. Una fonte spenta viene scartata sul
  server: non arriva nemmeno in "Da confermare".
- **Revolut: dividi a metà** —
  - *Solo sul conto cointestato* (default): l'app dimezza **solo** le notifiche il cui
    titolo inizia col nome del conto condiviso (`Joint ·`, `Conto cointestato ·`), e
    registra per intero i pagamenti personali sulla stessa carta.
  - *Sempre*: comportamento storico, ogni pagamento Revolut viene dimezzato.
  - *Mai*: nessuna divisione.
- **Importi da segnalare come cauzione** — precompilato con **103,29 €**, il blocco che i
  distributori di benzina mettono sulla carta e che poi rilasciano. Una bozza con questo
  importo resta in "Da confermare" con un avviso ben visibile: la elimini invece di
  registrarla. Non viene mai scartata in automatico, così se quella cifra è una spesa vera
  la puoi confermare lo stesso. Il controllo guarda anche l'importo **prima** dell'eventuale
  ÷2: senza questo, la cauzione Tamoil da 103,29 € su Revolut cointestato diventerebbe
  51,65 € e non verrebbe più riconosciuta.

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
