# BoaVida Backstage

Gestionale completo per organizzatori, PR e invitati. Next.js 16, React, Tailwind e PostgreSQL/Neon; pronto per Vercel.

## Funzioni

- Organizzatori: eventi, prezzi, capienze, profili, tutte le liste e i tavoli, incasso teorico, check-in e pagamento manuale.
- PR: soltanto le proprie liste, i propri ospiti e i propri tavoli. I contatori generali mostrano esclusivamente quanti tavoli sono prenotati/disponibili. I permessi sono applicati nelle API e nell'interfaccia.
- Inviti pubblici distinti per lista e tavolo. Nome, cognome e conferma della lista; nessun codice da presentare all'ingresso.
- CSV alfabetico compatibile con Excel e stampa/PDF; doppioni, link rigenerabili, scadenze e registro attività.
- Loghi BoaVida originali, responsive e senza ritagli nella barra laterale.

## Avvio locale

1. Node.js 22.13+ e pnpm 11.
2. `pnpm install`
3. Copiare `.env.example` in `.env.local` e compilare `DATABASE_URL`, `BOAVIDA_ADMIN_PASSWORD` e `BOAVIDA_PR_PASSWORD`.
4. `pnpm dev`

Il database deve essere PostgreSQL Neon. La connessione è inizializzata soltanto al primo utilizzo, per consentire la build senza credenziali. Il primo accesso crea le tabelle e i profili iniziali dopo aver verificato la password. Nessuna password o informazione sugli invitati è inclusa nel repository.

Username iniziali: `tommaso` (organizzatore) e `pr.boavida` (PR). Personalizzabili con le relative variabili `BOAVIDA_*_USERNAME`. In alternativa alle password iniziali si possono usare `BOAVIDA_ADMIN_HASH` e `BOAVIDA_PR_HASH`, nel formato PBKDF2 SHA-256 `sale_esadecimale:hash_esadecimale`, 100.000 iterazioni. Le credenziali iniziali non sovrascrivono password cambiate né riattivano utenti disabilitati.

## Vercel

1. Importare `tommasocavalli08-beep/BoaVidaBackstage`, branch `main`, framework Next.js.
2. Collegare un database Neon dal Marketplace/Storage del progetto. L'integrazione imposta `DATABASE_URL` (è accettato anche `POSTGRES_URL`).
3. Impostare come variabili segrete di produzione le due password iniziali, oppure i due hash.
4. Distribuire. I push successivi a `main` attivano automaticamente il deploy se la repo è collegata al progetto.

L'archivio risiede nel database, mai nel filesystem temporaneo delle funzioni Vercel o nel browser. Le operazioni di scrittura usano transazioni PostgreSQL e un lock comune: inviti simultanei non possono superare le capienze.

Il primo evento è chiuso. Prima di condividere inviti, l'organizzatore deve confermare data, prezzi e capienze in Impostazioni e aprire le iscrizioni. L'incasso teorico usa le tariffe correnti; il pagamento è registrato manualmente, senza pagamento online.

## Verifiche

- `pnpm typecheck`
- `pnpm test`: isolamento fra due PR, tentativi di modifica delle liste altrui, contatori globali senza dati personali, invito senza codice, concorrenza/capienze, check-in e revoca credenziali. Il test usa PostgreSQL locale tramite PGlite e gli stessi handler dell'applicazione.
- `pnpm build`

I file e le configurazioni specifiche di Cloudflare/Sites non sono necessari per questa versione.
