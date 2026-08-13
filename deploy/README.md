# Deploy Futuri (im)possibili

App servita sotto `/futuri-impossibili` (basePath) da un processo Node (`vinext start`)
sulla VM `{{VM_IP}}`, raggiunta dal proxy klab tramite DNAT sul server host.

## 1. Pacchetto sorgente

Dalla macchina di sviluppo (dal checkout del branch `feat/base-path`):

```bash
tar -czf futuri-impossibili.tgz --exclude=node_modules --exclude=.git --exclude=.serena --exclude=.wrangler --exclude=dist --exclude=.next --exclude=.vinext --exclude=examples --exclude=tests --exclude='tsconfig.tsbuildinfo' app public db worker build deploy .openai next.config.ts vite.config.ts package.json package-lock.json tsconfig.json postcss.config.mjs drizzle.config.ts README.md
```

Verifica che il tgz contenga `deploy/` (serve per `post-build.sh` e `init.d/`) e i sorgenti:

```bash
tar -tzf futuri-impossibili.tgz | grep -E '^(deploy|app|next.config)' | head
```

Copia sulla VM (SSH mappato dal bastion, porta {{SSH_PORT}} → {{VM_IP}}:22):

```bash
scp -P {{SSH_PORT}} futuri-impossibili.tgz {{BASTION_IP}}:/tmp
```

## 2. VM target (Alpine, {{VM_IP}})

```bash
apk add nodejs npm            # verificare: node --version (>= 22.13)
addgroup -S futuri
adduser -S -D -s /bin/sh -G futuri futuri
mkdir -p /opt/futuri-impossibili
tar -xzf /tmp/futuri-impossibili.tgz -C /opt/futuri-impossibili
chown -R futuri /opt/futuri-impossibili
chgrp -R futuri /opt/futuri-impossibili
mkdir -p /opt/futuri-impossibili/.wrangler
chown futuri /opt/futuri-impossibili/.wrangler
chgrp futuri /opt/futuri-impossibili/.wrangler
```

### Env
Creare `/opt/futuri-impossibili/.env.local` (vedi `deploy/env.local.example`):

```env
LEXO_SERVER_URL=http://localhost:8080/LexO-server
NEXT_PUBLIC_BASE_PATH=/futuri-impossibili
```

### Build (come utente futuri)
```bash
su futuri -s /bin/sh -c 'cd /opt/futuri-impossibili && npm ci && npm run build:deploy'
```

`npm run build:deploy` = build + `deploy/post-build.sh`, che sposta gli asset hashed
da `dist/client/futuri-impossibili/_next` a `dist/client/_next`. Necessario perché
`vinext start` serve `/_next/static/*` solo alla root (non sotto il basePath); il
proxy klab riscrive poi `/futuri-impossibili/_next/static/*` → `/_next/static/*`.

### Servizio openrc
```bash
cp deploy/init.d/futuri-impossibili /etc/init.d/futuri-impossibili
chmod +x /etc/init.d/futuri-impossibili
rc-service futuri-impossibili start
rc-service futuri-impossibili status
rc-update add futuri-impossibili default
```

Il servizio ascolta su `0.0.0.0:3001`; log su `/opt/futuri-impossibili/futuri-impossibili.log`
(directory di proprietà `futuri`: openrc apre il log come utente del servizio, quindi
`/var/log` non è scrivibile per default).

## 3. Server host (NAT)

Adattare `deploy/iptables-futuri-nat.sh` (in particolare `KLAB_IP`) ed eseguirlo da root:

```bash
sh deploy/iptables-futuri-nat.sh
```

Per la persistenza (Alpine):
```bash
apk add iptables
iptables-save > /etc/iptables/rules.v4
rc-update add iptables default
```

## 4. Proxy klab (Apache)

Aggiungere `deploy/klab-futuri-impossibili.conf` nel VirtualHost HTTPS di
`{{PUBLIC_HOST}}`, sostituendo `IP-DEL-SERVER-RAGGIUNGIBILE-DA-PROXY` con l'indirizzo
del server host raggiungibile da klab. Richiede `mod_proxy` e `mod_proxy_http`
(`a2enmod proxy proxy_http`).

La config contiene due regole (entrambe sotto `/futuri-impossibili/`, nessun path
esposto alla root di klab):
- `/${futuri_deploy}/_next/static` → `/_next/static` (asset hashed: JS/CSS/fonts);
- `/${futuri_deploy}/` → `${futuri_deploy}/` in passthrough (pagina, API `/api/lexo/*`, file pubblici).

Verifica rapida dopo il deploy:
```bash
curl -sI https://{{PUBLIC_HOST}}/futuri-impossibili/ | head -1
curl -sI https://{{PUBLIC_HOST}}/futuri-impossibili/_next/static/chunks/framework-*.js | head -1
curl -s https://{{PUBLIC_HOST}}/futuri-impossibili/api/lexo/lexical-concepts | head -c 200
```

## 5. Aggiornare un deploy già esistente

Dalla macchina di sviluppo: crea il tgz (punto 1) e copialo sulla VM.

```bash
scp -P {{SSH_PORT}} futuri-impossibili.tgz {{BASTION_IP}}:/tmp
```

Sulla VM: estrai sopra la directory esistente. `node_modules`, `.env.local`, log e
`dist/` NON vengono toccati (non sono nel tgz); vengono sovrascritti solo i sorgenti.

```bash
tar -xzf /tmp/futuri-impossibili.tgz -C /opt/futuri-impossibili
chown -R futuri /opt/futuri-impossibili
chgrp -R futuri /opt/futuri-impossibili

su futuri -s /bin/sh -c 'cd /opt/futuri-impossibili && npm ci && npm run build:deploy'

rc-service futuri-impossibili restart
rc-service futuri-impossibili status
```

Note:
- Se è cambiato `deploy/init.d/futuri-impossibili`, ricopialo in `/etc/init.d/` prima del restart:
  `cp /opt/futuri-impossibili/deploy/init.d/futuri-impossibili /etc/init.d/futuri-impossibili`.
- Se è cambiata la config klab (punto 4), aggiorna il VirtualHost su klab e ricarica Apache
  (es. `apachectl graceful`).
- `npm ci` ripristina `node_modules` dal lockfile (rimuove anche eventuali residui di
  versioni precedenti), quindi riduce il rischio di dist/build incoerenti.
