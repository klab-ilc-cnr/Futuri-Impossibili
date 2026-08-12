# Deploy Futuri (im)possibili

App servita sotto `/futuri-impossibili` (basePath) da un processo Node (`vinext start`)
sulla VM `10.10.0.14`, raggiunta dal proxy klab tramite DNAT sul server host.

## 1. Pacchetto sorgente

Dalla macchina di sviluppo (dal checkout del branch `feat/base-path`):

```bash
tar -czf futuri-impossibili.tgz --exclude=node_modules --exclude=.git --exclude=.serena --exclude=.wrangler --exclude=dist --exclude=.next --exclude=.vinext --exclude=examples --exclude=tests --exclude='tsconfig.tsbuildinfo' app public db worker build .openai next.config.ts vite.config.ts package.json package-lock.json tsconfig.json postcss.config.mjs drizzle.config.ts README.md
```

Copiare il tgz sulla VM (es. `scp`) in un percorso temporaneo.

## 2. VM target (Alpine, 10.10.0.14)

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
su futuri -s /bin/sh -c 'cd /opt/futuri-impossibili && npm ci && npm run build'
```

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
`klab.ilc.cnr.it`, sostituendo `IP-DEL-SERVER-RAGGIUNGIBILE-DA-KLAB` con l'indirizzo
del server host raggiungibile da klab. Richiede `mod_proxy` e `mod_proxy_http`
(`a2enmod proxy proxy_http`).

Tutto (pagina, API `/api/lexo/*`, asset, favicon) vive sotto `/futuri-impossibili/`.
