# Kort

Tenis kulübü için mobil öncelikli sosyal uygulama. Üyeler birbirini tanır, rakip arar, müsaitliğini paylaşır, defi yollar ve maç sonucunu işler.

Kort is a mobile-first club app: profiles, availability, player search, groups, challenges, and matches. Tournament brackets, the ladder ranking engine, and smart matchmaking UI come later. The database and module boundaries are already in place.

## Yerel geliştirme / Local development

Gerekenler: Node.js 22, pnpm 10, Docker.

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:43123
- API: http://localhost:43124

`pnpm db:migrate` geliştirme veritabanına mevcut migration'ı uygular. Şema değişirse yeni bir migration da üretir. CI ve üretim `pnpm db:deploy` kullanır.

Web, Prisma'ya doğrudan bağlanmaz. Tarayıcı yalnızca Next.js BFF'sine gider; BFF, access ve refresh token'ları httpOnly çerezde tutar ve API'ye `Authorization: Bearer` ile çıkar. Ayrı Vercel ve Railway alan adlarında üçüncü parti çerez güvenilir olmadığı için bu yol seçildi.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `pnpm install` | Bağımlılıklar |
| `pnpm dev` | API ve web birlikte |
| `pnpm db:generate` | Prisma client |
| `pnpm db:migrate` | Geliştirme migration |
| `pnpm db:deploy` | `migrate deploy` |
| `pnpm db:seed` | Geliştirme verisi |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | API testleri |
| `pnpm build` | Üretim derlemesi |

## Ortam değişkenleri / Environment variables

Örnekler: kök `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`. Gerçek sırlar git'e girmez.

API:

- `DATABASE_URL` — Postgres
- `ACCESS_TOKEN_SECRET` — access JWT imzası. Üretimde zorunlu.
- `WEB_ORIGIN` — CORS'a izin verilen web adresi. Virgülle birden fazla yazılabilir.
- `API_PUBLIC_URL` — yerel fotoğraf URL'leri için
- `PORT` — varsayılan `43124`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — üçü birden varsa yüklemeler Cloudinary'ye gider. Yoksa dosyalar `apps/api/uploads` altına yazılır.

Web:

- `API_INTERNAL_URL` — BFF'nin çağırdığı API. Tarayıcıya açılmaz.

Testler `TEST_DATABASE_URL` kullanır ve adında `test` geçmeyen bir veritabanına yazmayı reddeder.

## Railway (API + Postgres)

1. Railway'de bir Postgres ve bir servis aç. Servisin kökü bu depo olsun.
2. Değişkenler: `DATABASE_URL` (Railway Postgres), `NODE_ENV=production`, `ACCESS_TOKEN_SECRET`, `WEB_ORIGIN` (Vercel adresi), `API_PUBLIC_URL` (Railway API adresi), isteğe bağlı Cloudinary anahtarları.
3. Build:

```bash
pnpm install --frozen-lockfile
pnpm --filter @club/api exec prisma generate
pnpm --filter @club/api exec prisma migrate deploy
pnpm --filter @club/api build
```

4. Start: `node apps/api/dist/index.js`
5. Sağlık kontrolü: `GET /api/health`

`NODE_ENV=production` iken seed çalışmaz. Demo kullanıcılar üretilmez.

## Vercel (web)

1. Projeyi içe aktar. Root Directory: `apps/web`.
2. Framework: Next.js. pnpm workspace'i Vercel kökten kurar.
3. `API_INTERNAL_URL` değerini Railway API adresine ayarla.
4. Railway tarafında `WEB_ORIGIN` bu Vercel adresini içersin.

Canlı deploy için hesap gerekmez. Pull request'te GitHub Actions lint, typecheck, test ve build çalıştırır.

## Demo hesaplar

Yalnızca geliştirme. `pnpm db:seed` production'da çalışmaz. Parola hepsi için `Demo1234!`.

| E-posta | Rol |
| --- | --- |
| admin@tennisclub.local | ADMIN |
| manager@tennisclub.local | CLUB_MANAGER |
| tournament@tennisclub.local | TOURNAMENT_MANAGER |
| member@tennisclub.local | MEMBER |
| burak.aydin@tennisclub.local | GROUP_MANAGER (Sabah Tenisçileri) |

Diğer seed hesapları da aynı parolayı kullanır ve `@tennisclub.local` adreslidir. Hepsi kurgusal kulüp üyesidir.

## Takvim ve kortlar

`/takvim` oyuncu müsaitliğidir: günler × 08:00–22:00. Yeşil saat, en az iki görünen oyuncu ve aralarında seviye farkı en fazla 1 olan bir çift demektir. Bir saate dokununca panel açılır; aynı günde bitiş saati hariç bir aralık seçilebilir (18:00–21:00, 18, 19 ve 20’yi kapsar). Aralıkta bir kort ancak her saatte boşsa boş sayılır.

`/kortlar` yalnızca gün tablosudur: sütunlar Kapalı 1–3, sonra Kort 1–9; satırlar 08:00–22:00. Üstte haftanın günleri durur; önceki ve sonraki haftayı değiştirir. Dar ekranda K1, K2, K3 ve 1–9 yan yana durur. Seçilen saatlere maç, antrenman, bakım veya turnuva yazılır; boş ve iptal saati bırakır. Maç rakip istemez. Üye talebi onay bekler, yöneticinin kaydı hemen onaylıdır. Dolu hücrede iptal ve check-in vardır. `/kortlar/[id]` haftası Takvim bağlantıları için durur. Takvimdeki kort adı da o kortun haftasına gider.

Kulüp kortları migration ile gelir, seed ile değil: Kapalı 1–3 balon korttur (kapalı), Kort 1–9 açık korttur. Ekran sırası budur. Üyeler maç ve antrenman talebi açar; turnuva sorumlusu turnuva talebi açar; yönetici bakım dahil her amacı açar. Yönetici kaydı onaylıdır, diğerleri ADMIN onaylar. Çakışma reddedilir. Check-in, `checkInLeadHours` (varsayılan 3) saat kala açılır ve kort saati başlayınca kapanır.

## Bu dilimde olmayanlar

Canlı Railway veya Vercel yayını, e-posta gönderimi ve uygulama dışındaki anlık bildirimler bu dilimde yok. Bildirimler uygulama içindedir; WhatsApp kendiliğinden gitmez. Rakip önerisi kural tabanlıdır: ana sayfadaki “Bu akşam sana uygun” bloğu `Matchmaker` servisinin kısa gerekçesini gösterir.
