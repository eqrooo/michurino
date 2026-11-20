# Мичурино — сайт комплекса для отдыха (handoff для Claude Code)

Сайт: **https://michurino.asia** · Админка: **https://michurino.asia/admin.html**
Репозиторий: `eqrooo/michurino` (public, ветка `main`, деплой GitHub Pages из корня).

## Кто заказчик и как с ним общаться
- Пользователь — Мадияр, не программист. Пишет по-русски; просит отвечать по-человечески **и с матами** (в меру).
- Сам он правит только `content.js` (тексты, цены, телефоны). Всё остальное делаешь ты.
- Принцип: всё максимально просто для владельца, никаких сборок/фреймворков.
- Никогда не проси прислать пароли/токены в чат. Секреты пользователь сам вставляет в Supabase Dashboard → Edge Functions → Secrets.

## Бизнес
Комплекс «Мичурино», ул. Пионеров, 82, с. Тепличное (Кызылжарский р-н, под Петропавловском).
- **Двухэтажный коттедж** — 100 000 ₸/сутки, до 20 гостей за столом, 15 спальных мест. Сдаётся **посуточно** (не писать «на неделю»).
- **Банкетный зал** (одноэтажный дом) — 150 000 ₸, до 70 гостей, без еды; повара по договорённости.
- **Баня** — 5 000 ₸/час, минимум 3 часа.
- Территория: беседка (не сдаётся отдельно), мангальная зона, детская площадка.
- Телефон владельца +7 (775) 454-26-00; WhatsApp: +7 (747) 858-89-42 и +7 (775) 454-26-00. Instagram `arenda_michurino_`. 2ГИС geo id `70000001112476421`.
- Все эти данные лежат в `content.js` — источник правды для текстов.

## Стек и архитектура
- **Фронт**: чистый статический HTML/CSS/JS, без сборки. GitHub Pages + домен `michurino.asia` (файл `CNAME`; DNS у ps.kz: A → 185.199.108.153, www CNAME → michurino.asia). HTTPS работает.
- **Бэкенд**: Supabase (project ref `suerxffntlexrhqujywj`, eu-central-1, free tier). Postgres + RLS, Auth (email+пароль), Storage (bucket `post-images`), Edge Functions (Deno).
- Клиент Supabase: `@supabase/supabase-js@2.117.3` UMD с jsDelivr; ключ — **publishable** (`config.js`, публичный по задумке).
- `.github/workflows/keep-alive.yml` — пинг базы раз в 2 дня, чтобы free-проект Supabase не засыпал.

## Файлы
| Файл | Что это |
|---|---|
| `index.html` | Главная: hero с фото, «О комплексе», карточки объектов с ценами, галерея с вкладками + лайтбокс, новости (посты из БД), форма брони, карта 2ГИС, футер |
| `complex.html` | Страница «О комплексе»: подробные секции коттедж/зал/баня + территория + мероприятия. Рендерится из `content.js` |
| `content.js` | **Все тексты, цены, контакты, список фото по вкладкам** (`gallery`, `objects`, `extras`, …). Единственный файл, который правит владелец |
| `app.js` | Общий скрипт обеих страниц (с проверками наличия элементов). Рендер, лайтбокс, карта, посты, счётчик визитов, форма брони, скрытый вход в админку (5 тапов по логотипу в футере) |
| `styles.css` | Стили. Токены в `:root`, бело-зелёная палитра, шрифты Cormorant Garamond + Manrope (кириллица) |
| `admin.html/js/css` | Админка: вход/регистрация (две вкладки), вкладки «Заявки», «Посты», «Посещения», «Доступ» (запросы доступа, список админов, подключение Telegram) |
| `config.js` | URL Supabase + publishable key. Не трогать |
| `photos/<street|house2|house1|banya>/NN.jpg` и `NN-s.jpg` | Фото: большое (≤1600px) и превью (≤640px). house2 = коттедж, house1 = банкетный зал |
| `supabase/migrations/*.sql` | Схема БД (точная копия применённых миграций) |
| `supabase/functions/*/index.ts` | Код Edge Functions (копия задеплоенного) |
| `supabase/config.toml` | verify_jwt для каждой функции |

## База данных (кратко)
- `bookings` — заявки (`object` cottage/hall/banya/complex, `date_in`, `date_out` nullable, `hours` для бани, `guests` ≤150, `status` new/confirmed/done/cancelled, `tg_sent`). Аноним может только INSERT со status='new'. Читают/меняют только админы.
- `posts` — новости; публичное чтение published. Фото в Storage `post-images` (пишут только админы).
- `visits` — счётчик посещений без личных данных.
- `admins` — кто админ. Функция `is_admin()` используется во всех RLS-политиках.
- `admin_requests` + RPC `request_admin()`, `decide_admin()`, `list_admins()`, `remove_admin()` — флоу выдачи доступа.
- `tg_chats`, `tg_link_codes` — привязка Telegram-чатов админов. RLS включён, политик нет (доступ только service role из функций).
- Триггер `bookings_notify_tg` → `pg_net` POST на функцию `tg-booking`.
- Предупреждения линтера про SECURITY DEFINER функции — **ожидаемые**: внутри каждая проверяет `is_admin()`/`auth.uid()`.

## Edge Functions
| Функция | verify_jwt | Назначение |
|---|---|---|
| `tg-booking` | false | Новая заявка → сообщение в Telegram всем `tg_chats` (кнопки WhatsApp / Открыть админку). Идемпотентно через `tg_sent` |
| `tg-webhook` | false | Вебхук Telegram-бота. Проверяет заголовок `X-Telegram-Bot-Api-Secret-Token` = sha256("michurino:"+token)[:48]. `/start <code>` — привязка чата, `/stop`, `/admin`; callback-кнопки `acc:ok:<id>` / `acc:no:<id>` — подтвердить/отклонить запрос доступа (только из привязанного чата действующего админа). Ставит menu button «Админка» (web_app) |
| `tg-link` | true | Из админки: статус бота, одноразовая ссылка привязки, тест, отвязка. Держит вебхук с `allowed_updates: ["message","callback_query"]` |
| `tg-setup` | false | Идемпотентно переустанавливает вебхук. `curl -X POST https://suerxffntlexrhqujywj.supabase.co/functions/v1/tg-setup -H "apikey: <publishable key>"` |
| `notify-admin` | true | Пользователь запросил доступ → Telegram (с кнопками) + email через Resend, если задан `RESEND_API_KEY` |
| `register` | false | Регистрация админа без письма-подтверждения (`auth.admin.createUser`, email_confirm=true). Лимит 10 регистраций/час. Прав не даёт |

Секреты в Supabase (значения у владельца, не в репо): `TELEGRAM_BOT_TOKEN` (задан), `RESEND_API_KEY` (возможно не задан — тогда письма не шлются, всё работает через Telegram). Опционально `ADMIN_EMAIL`, `SITE_URL`.

## Как деплоить
- **Фронт**: коммит + push в `main` → GitHub Pages обновляется за 1–2 мин. Коммиты от имени `eqrooo`.
- **Функции**: `supabase functions deploy <name> --project-ref suerxffntlexrhqujywj` (или через Supabase MCP `deploy_edge_function`; verify_jwt брать из таблицы выше!).
- **Схема**: новые миграции — отдельным файлом в `supabase/migrations/` + применить (`supabase db push` или MCP `apply_migration`).
- ⚠️ **Перед деплоем функции проверяй синтаксис** (`deno check` или хотя бы TS transpile). Однажды `await` внутри не-async стрелки уронил бота с 503 — кнопки в Telegram «мигали» и не работали.
- После изменений в схеме — `get_advisors` (security).

## Проверка
- Локально: `python3 -m http.server` в корне, открыть в браузере (Playwright подходит для скриншотов десктоп 1440 / мобилка 390).
- Тестовые заявки/посещения/аккаунты после проверки **удалять** из БД (владелец смотрит статистику).
- Тестовая заявка шлёт реальное сообщение владельцу в Telegram — предупреждай или не делай без нужды.

## Статус на 20.11.2026 и что открыто
Готово: сайт, страница комплекса, фото, цены, карта, бронь с выбором объекта, админка (заявки/посты/статистика/доступ), регистрация без писем, Telegram-уведомления о заявках и запросах доступа с кнопками подтверждения, домен + HTTPS, keep-alive.

Проверить в начале работы:
1. Висят ли в `admin_requests` запросы со статусом `pending` и подтвердил ли их владелец кнопками в Telegram (после фикса бота 10.11 он должен был нажать ещё раз).
2. В GitHub → Settings → Pages включена ли галочка «Enforce HTTPS».
3. Задан ли `RESEND_API_KEY` (если нет — и не надо, Telegram основной канал).

Идеи, которые обсуждались, но не сделаны: защита формы от спама (Cloudflare Turnstile), сброс пароля в админке, автопродление домена у ps.kz (напомнить владельцу продлевать раз в год).
