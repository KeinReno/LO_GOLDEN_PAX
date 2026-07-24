# GMap — деплой на VPS (Timeweb / Selectel / любой Ubuntu)

Постоянный URL для игроков: `https://ТВОЙ-ДОМЕН/view`  
Мастер: `https://ТВОЙ-ДОМЕН/` → правишь карту → «Опубликовать».

Стек: **Nginx** (порт 80/443) → **Node** (`server/serve.mjs` + API) → том `data/` (published.json).

---

## 0. Что купить

- VPS: 1 vCPU / 1 GB RAM хватает (Ubuntu 22.04+).
- Домен (по желанию, но лучше сразу): `map.твой-домен.ru` → A-запись на IP VPS.

Открой в панели хостинга порты **80** и **443**.

---

## 1. На сервере один раз

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогинься

# Код (вариант A — git)
git clone <ТВОЙ_РЕПО> gmap && cd gmap/GMap

# или вариант B — scp/rsync с ПК
# rsync -avz --exclude node_modules --exclude dist ./GMap/ user@IP:~/gmap/
```

```bash
cp .env.example .env
nano .env
# GMAP_MASTER_TOKEN=длинный-секрет
# DOMAIN=map.example.com
```

Тот же токен вводи в поле мастер-токена в редакторе на сайте (по умолчанию в UI `master2142` — смени и там).

```bash
docker compose up -d --build
```

Проверка:

```bash
curl -s http://127.0.0.1/api/health
# {"ok":true}

# с телефона / другого оператора:
http://IP_СЕРВЕРА/view
```

---

## 2. HTTPS (Let's Encrypt)

Когда домен уже указывает на VPS:

```bash
# webroot уже проброшен в compose как certbot-www
docker run --rm -it \
  -v gmap_certbot-www:/var/www/certbot \
  -v "$(pwd)/deploy/certs:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d map.example.com --email you@example.com --agree-tos --no-eff-email
```

Скопируй сертификаты в формат, который ждёт nginx:

```bash
sudo cp deploy/certs/live/map.example.com/fullchain.pem deploy/certs/fullchain.pem
sudo cp deploy/certs/live/map.example.com/privkey.pem deploy/certs/privkey.pem
```

(если certbot положил файлы иначе — найди `fullchain.pem` / `privkey.pem` и положи в `deploy/certs/`).

В `deploy/nginx.conf` раскомментируй блок `listen 443`, подставь `server_name`, затем:

```bash
docker compose exec nginx nginx -s reload
```

Игрокам даёшь только: `https://map.example.com/view`

---

## 3. Как жить дальше

| Действие | Команда / UI |
|----------|----------------|
| Обновить код карты | `git pull && docker compose up -d --build` |
| Опубликовать ход | Мастер открывает `/`, жмёт «Опубликовать» |
| Игроки смотрят | `/view` + пароль фракции |
| Бэкап карты | `docker compose exec gmap cat /app/data/published.json > backup.json` |
| Логи | `docker compose logs -f gmap nginx` |

Том `gmap-data` переживает пересборку образа — published и заявки игроков не пропадут.

---

## 4. Без Docker (Timeweb «приложение» / свой nginx)

```bash
cd GMap
npm ci
npm run build
export GMAP_MASTER_TOKEN='твой-секрет'
export PORT=4173
node server/serve.mjs
```

В панели / nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:4173;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 32m;
}
```

systemd unit пример: `deploy/gmap.service`.

---

## 5. Почему это чинит МТС / Теле2

Quick Tunnel (`*.trycloudflare.com`) — временный DNS, у части операторов он не резолвится.  
VPS + обычный домен/IP — обычный A-запись, работает у всех операторов.

---

## Быстрый чеклист

1. [ ] VPS + Docker  
2. [ ] `.env` с новым `GMAP_MASTER_TOKEN`  
3. [ ] `docker compose up -d --build`  
4. [ ] Открыть `/view` с МТС  
5. [ ] Домен + HTTPS  
6. [ ] Сообщить игрокам одну ссылку навсегда  
