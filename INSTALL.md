# Installazione e deploy — Futuri (im)possibili

Guida operativa end-to-end: compilazione e avvio in locale, build di produzione e deploy
sulla VM. Dettagli di prima installazione e configurazioni del server host in
`deploy/README.md` (qui solo i passi concreti e ripetibili).

> **Nota**: questa è la versione con i segnaposto generici `{{VAR}}`. La copia con i valori
> concreti della propria rete è `INSTALL.local.md` (non tracciata in git — vedi sezione
> "Variabili da istanziare").

## Topologia di riferimento

```
[Browser] ──HTTPS──▶ [Reverse proxy (Apache)]
                        │  ProxyPass /futuri-impossibili/*
                        ▼
                 [Server host (NAT)]
                        │  DNAT: {{NAT_PORT}} → {{VM_IP}}:3001
                        ▼
                  [VM (vinext start :3001)]
                        ▲
                        │  scp via bastion (SSH {{SSH_PORT}})
              [Macchina di sviluppo]
```

Ruoli (senza riferimenti alla rete specifica, vedi "Variabili da istanziare"):

- **Reverse proxy (Apache)** — espone il sito in HTTPS su `https://{{PUBLIC_HOST}}/futuri-impossibili/`;
  riscrive gli asset `/futuri-impossibili/_next/static/*` → `/_next/static/*` e inoltra il resto
  (pagina, API `/api/lexo/*`, file pubblici) in passthrough.
- **Server host (NAT)** — DNAT della porta host `{{NAT_PORT}}` verso `{{VM_IP}}:3001`
  (source limitato al reverse proxy).
- **VM (Alpine)** — servizio openrc, `vinext start` su `0.0.0.0:3001`, log in
  `/opt/futuri-impossibili/futuri-impossibili.log`.
- **Bastion (SSH)** — porta `{{SSH_PORT}}` verso la VM per `scp` del pacchetto di deploy.

Stack: **Next.js 16 App Router eseguito su Vite** tramite **vinext** (`vinext build`/`vinext start`,
NON `next build`). L'app gira sotto il basePath `/futuri-impossibili`. Il backend **LexO-server**
è contattato SOLO tramite i proxy API in `app/api/lexo/*`.

---

## 1. Prerequisiti

- Node.js >= 22.13 (su macchine con npm 11 che blocca i postinstall: se mancano i binari
  nativi dopo `npm ci`, eseguire a mano
  `node node_modules/workerd/install.js` e `node node_modules/esbuild/install.js`).
- Il backend LexO-server deve essere raggiungibile (locale, remoto o sulla VM).

## 2. Installazione dipendenze

```bash
npm ci
```

## 3. Locale — sviluppo

```bash
npm run dev
```

- App servita su `http://localhost:3000/futuri-impossibili/` (basePath attivo anche in dev).
- **Nota**: `vinext dev` gira dentro workerd/miniflare, che NON raggiunge IP privati come il
  LexO di test (`{{LEXO_TEST_URL}}` → "Network connection lost"). Per le API contro il
  backend remoto usa il flusso di produzione (sezione 4).

## 4. Locale — test con build di produzione (back-end remoto incluso)

Flusso che replica il comportamento in produzione, compreso il workaround degli asset.

```bash
# 1) build + spostamento asset alla root
npm run build:deploy

# 2) server di produzione (porta 3000)
npm run start

# 3) in un'altra shell: proxy locale (porta 3001) che riscrive
#    /futuri-impossibili/_next/static/* -> /_next/static/*
npm run start:proxy
```

Apri quindi `http://localhost:3001/futuri-impossibili/` (avviso: sulla 3000 gli asset
`_next/static` non sono serviti sotto il basePath → 404). Per usare il backend remoto di test:

```bash
LEXO_SERVER_URL={{LEXO_TEST_URL}} npm run start
```

Smoke test del proxy:

```bash
curl -s http://localhost:3001/futuri-impossibili/api/lexo/lexical-concepts | head -c 300
```

### Percorso completo da zero (se non si vuole 3000 separata)

```bash
npm ci
npm run build:deploy
LEXO_SERVER_URL={{LEXO_TEST_URL}} npm run start   # shell 1
npm run start:proxy                                # shell 2
```

### Configurazione backend in locale

Variabili lette dai route handler in `app/api/lexo/**` (default: `http://localhost:8080/LexO-server`).
Creare `.env.local` nella root del progetto se il backend non è sul default:

```env
LEXO_SERVER_URL={{LEXO_TEST_URL}}
LEXO_SERVER_AUTHORIZATION=             # se richiesta (alcune route)
NEXT_PUBLIC_BASE_PATH=/futuri-impossibili    # default comunque coperto
```

## 5. Server — deploy sulla VM (Alpine)

La VM **non ha git**: il trasferimento avviene via tgz + scp (SSH mappato dal bastion,
porta `{{SSH_PORT}}` → VM:22).

### 5.1 Creare il pacchetto (dalla macchina di sviluppo)

```bash
tar -czf futuri-impossibili.tgz \
  --exclude=node_modules --exclude=.git --exclude=.serena --exclude=.wrangler \
  --exclude=dist --exclude=.next --exclude=.vinext --exclude=examples --exclude=tests \
  --exclude='tsconfig.tsbuildinfo' \
  app public db worker build deploy .openai \
  next.config.ts vite.config.ts package.json package-lock.json tsconfig.json \
  postcss.config.mjs drizzle.config.ts README.md INSTALL.md
```

Verifica che contenga sorgenti e `deploy/` (serve `post-build.sh` e `init.d/`):

```bash
tar -tzf futuri-impossibili.tgz | grep -E '^(deploy|app|next.config)' | head
```

Copia sulla VM:

```bash
scp -P {{SSH_PORT}} futuri-impossibili.tgz {{BASTION_IP}}:/tmp
```

### 5.2 Sulla VM (come root)

```bash
tar -xzf /tmp/futuri-impossibili.tgz -C /opt/futuri-impossibili
chown -R futuri /opt/futuri-impossibili
chgrp -R futuri /opt/futuri-impossibili

su futuri -s /bin/sh -c 'cd /opt/futuri-impossibili && npm ci && npm run build:deploy'

rc-service futuri-impossibili restart
rc-service futuri-impossibili status
```

- `npm run build:deploy` = build + `deploy/post-build.sh` (asset hashed da
  `dist/client/futuri-impossibili/_next` a `dist/client/_next`). **Mai deployare con
  `npm run build` semplice**: gli asset non verrebbero serviti (404).
- `node_modules`, `dist/`, `.env.local` e i log NON sono nel tgz → non vengono toccati.

### 5.3 Prima installazione sulla VM (solo la prima volta)

Il servizio e l'ambiente di produzione si configurano una tantum; vedere `deploy/README.md`
(sezione 2) per: utente `futuri`, `/opt/futuri-impossibili`, `/opt/futuri-impossibili/.env.local`,
script `deploy/init.d/futuri-impossibili` in `/etc/init.d/` e registrazione in openrc.

`.env.local` sulla VM:

```env
LEXO_SERVER_URL=http://localhost:8080/LexO-server
NEXT_PUBLIC_BASE_PATH=/futuri-impossibili
```

Servizio: `rc-service futuri-impossibili start` + `rc-update add futuri-impossibili default`
(porta `3001` su `0.0.0.0`; log in `/opt/futuri-impossibili/futuri-impossibili.log`).

## 6. Apache (reverse-proxy pubblico)

Configurazione proxy del VirtualHost HTTPS del dominio pubblico; richiede `mod_proxy`,
`mod_proxy_http` e `mod_rewrite` (`a2enmod proxy proxy_http rewrite`). Template pronto in
`deploy/reverse-proxy-futuri-impossibili.conf` da includere nel VirtualHost, sostituendo
l'host del server raggiungibile dal proxy con la propria rete.

Il file definisce (pagina + API in passthrough, asset riscritti alla root):

```apache
Define futuri_host IP-DEL-SERVER-RAGGIUNGIBILE-DA-PROXY
Define futuri_port {{NAT_PORT}}
Define futuri_deploy futuri-impossibili

ProxyPreserveHost On

RewriteEngine On
RewriteRule ^/${futuri_deploy}$ /${futuri_deploy}/ [R,L]

# Asset hashed (JS/CSS/fonts): vinext li serve solo alla root
ProxyPass        /${futuri_deploy}/_next/static http://${futuri_host}:${futuri_port}/_next/static
ProxyPassReverse /${futuri_deploy}/_next/static http://${futuri_host}:${futuri_port}/_next/static

# Tutto il resto (pagina, API /api/lexo, file pubblici)
ProxyPass        /${futuri_deploy}/ http://${futuri_host}:${futuri_port}/${futuri_deploy}/
ProxyPassReverse /${futuri_deploy}/ http://${futuri_host}:${futuri_port}/${futuri_deploy}/
```

Dopo l'aggiornamento: `apachectl graceful`.

## 7. Verifica del deploy (pubblico)

```bash
curl -sI https://{{PUBLIC_HOST}}/futuri-impossibili/ | head -1
curl -sI https://{{PUBLIC_HOST}}/futuri-impossibili/_next/static/chunks/framework-*.js | head -1
curl -s https://{{PUBLIC_HOST}}/futuri-impossibili/api/lexo/lexical-concepts | head -c 200
```

## 8. FAQ / note

- **Porta 3000 vs 3001**: `vinext start` sulla 3000 (o sulla porta del servizio VM, 3001 in
  produzione). La 3001 locale è solo il reverse-proxy `deploy/local-proxy.mjs`.
- **Asset 404**: sintomo di deploy con `npm run build` (senza `build:deploy`) oppure config
  Apache mancante per `/_next/static`.
- **`npm test` si rompe per design** (i test del template puntano ad `app/_sites-preview/`).
- **Check qualità locale**: `npm run lint` (0 errori attesi; i 3 warning `<img>` sono accettati)
  e typecheck `npx tsc --noEmit` (errori pre-esistenti in `worker/index.ts` e `db/index.ts`
  sono file morti del template).

## 9. Variabili da istanziare

Compilare la copia locale (`INSTALL.local.md`) sostituendo i placeholder:

| Placeholder            | Valore (esempio) |
|------------------------|------------------|
| `{{LEXO_TEST_URL}}`    | `http://<HOST_LEXO_TEST>:<PORT>/LexO-server` |
| `{{VM_IP}}`            | `<IP_VM>` |
| `{{SSH_PORT}}`         | `<PORTA_SSH_VM>` |
| `{{BASTION_IP}}`       | `<IP_BASTION_PER_SCP>` |
| `{{NAT_PORT}}`         | `<PORTA_NAT>` |
| `{{PUBLIC_HOST}}`      | `<DOMINIO_PUBBLICO>` |

Suggerimento per creare la copia: `cp INSTALL.md INSTALL.local.md` quindi sostituire i
placeholder con `sed` o a mano. `INSTALL.local.md` NON va committato.