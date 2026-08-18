# Passare a questa app portandosi dietro configurazione e storico

Pensato per chi usa **finance-app-marta** (o un'altra installazione di questa app) e vuole
spostarsi qui mantenendo le proprie categorie e tutto lo storico.

L'app non impone più una tassonomia unica: le categorie sono **dati dell'account**, non
costanti del codice. Due persone sullo stesso deploy possono usare categorie che non hanno
niente in comune.

---

## 1. Esporta i dati dalla vecchia app

Sul dispositivo dove gira finance-app-marta:

**Impostazioni → Esporta JSON** → salva il file (`finance-backup-AAAA-MM-GG.json`).

Contiene transazioni, obiettivi di risparmio e impostazioni. Mandalo al dispositivo su cui
farai il primo accesso (mail, AirDrop, cartella condivisa: basta che il file arrivi intero).

> Fallo **prima** di qualsiasi altra cosa. È anche il tuo backup di sicurezza.

---

## 2. Crea l'account

Apri l'app → schermata di login → **Registrati** con email e password.
(Se in Supabase è attivo *Confirm email*, clicca il link che arriva prima del primo accesso.)

---

## 3. Primo avvio: scegli le categorie e importa

Al primo accesso, con l'account ancora vuoto, compare la schermata di setup.

1. **Scegli il set di categorie.**
   - *Categorie dettagliate* — le 32 categorie di finance-app-marta (Alimentari, Benzina,
     Parrucchiera / Estetista…), un solo livello, nessuna sottocategoria. È quello da
     scegliere per ritrovare tutto com'era.
   - *Categorie ampie + sottocategorie* — 12 categorie principali ognuna con le sue
     sottocategorie.
2. **Carica backup JSON** → seleziona il file del punto 1.
   L'app legge il file e **preseleziona da sola** il set che combacia meglio con le
   categorie che ci trova dentro, quindi di solito il punto 1 è già risolto.
   Ti dice quante transazioni ha trovato e se ci sono categorie non previste dal set.
3. **Importa e inizia.**

Cosa succede ai dati:

| | |
|---|---|
| Transazioni | importate tutte, con data, importo, descrizione e categoria originali |
| Categorie non presenti nel set scelto | **aggiunte automaticamente** all'account — niente viene perso o rimappato a caso |
| Obiettivi di risparmio | importati |
| Righe illeggibili | saltate e conteggiate nel riepilogo, il resto viene importato lo stesso |
| Spese marcate "ricorrente" nella vecchia app | importate come spese normali. Le regole ricorrenti qui funzionano diversamente (una regola genera una spesa al mese): le imposti da *Impostazioni → Spese ricorrenti* come le vuoi tu |

Da qui in poi la app è quella nuova — dashboard, analytics, riconciliazione, cattura dalle
notifiche — ma con le **tue** categorie.

### Se hai già iniziato a usare l'app e vuoi importare dopo

Nessun problema: **Impostazioni → Import/Export Dati → Importa JSON**. Fa esattamente le
stesse cose, comprese l'aggiunta delle categorie mancanti. Reimportare due volte lo stesso
file non crea doppioni (i record hanno lo stesso id e vengono sovrascritti).

---

## 4. Sistemare le categorie

**Impostazioni → Categorie**:

- **Aggiungi** una categoria con la sua emoji.
- **Elimina** quelle che non usi. Una categoria già usata da qualche spesa non è
  eliminabile (il numerino sul badge dice quante): altrimenti quelle spese sparirebbero dai
  grafici e dai totali.
- **Riparti da un set predefinito** se vuoi cambiare impostazione. Le categorie già usate
  dalle tue spese vengono comunque mantenute. Le spese **non** vengono ricategorizzate
  automaticamente: quello resta un lavoro manuale, e va fatto solo se vuoi davvero cambiare
  modo di ragionare.

Le **sottocategorie** compaiono nel form solo se il tuo set ne ha almeno una. Con le 32
categorie dettagliate il campo resta nascosto: un livello solo, si sceglie e si va. Se un
giorno ne aggiungi una da *Impostazioni → Gestione Sottocategorie*, il campo si accende.

---

## 5. Sincronizzazione e altri dispositivi

Da qui in avanti l'account è sul cloud: fai login sul telefono e ritrovi tutto.
Stato e pulsante *Sincronizza ora* stanno in **Impostazioni → Account e sincronizzazione**.

Il setup iniziale compare solo su un account **davvero** nuovo: al login su un secondo
dispositivo l'app aspetta la prima sincronizzazione, così non ti chiede di riscegliere le
categorie e non sovrascrive quelle che hai già.

**Se su un altro dispositivo mancano le spese vecchie**, quelle arrivate da un backup JSON:
la sincronizzazione normale porta solo quello che è cambiato dall'ultimo giro, e uno storico
importato può restarne fuori. Sul dispositivo che **ha** lo storico (quello dove hai fatto
l'import) premi *Impostazioni → Account e sincronizzazione → **Risincronizza tutto***: rimanda
in cloud l'intero archivio. Gli altri dispositivi lo scaricano alla sincronizzazione successiva.

Premilo sempre sul dispositivo giusto: manda al cloud quello che quel dispositivo ha in
memoria, sotto l'account con cui sei loggato in quel momento.

---

## 6. Cattura automatica dalle notifiche

È la parte che va installata sul telefono: vedi **[NOTIFICATION_CAPTURE.md](NOTIFICATION_CAPTURE.md)**.
In sintesi serve, per ogni persona:

1. un **token** in più nella variabile `INGEST_TOKENS` su Vercel, associato al suo user id
   Supabase;
2. **MacroDroid** sul suo telefono con **una** macro e **due** trigger — uno per le app di
   pagamento senza filtri, uno per l'SMS della carta filtrato su "Autorizzato pagamento" —
   e una sola azione *Richiesta HTTP POST* col suo token;
3. le regole in **Impostazioni → Cattura automatica dalle notifiche**: quali app catturare,
   se dividere Revolut a metà (di default solo sulle notifiche "Joint" del conto
   cointestato), quali importi segnalare come cauzione.
