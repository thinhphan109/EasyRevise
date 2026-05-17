# EasyRevise — Production Deploy Runbook

Step-by-step để deploy lên `https://easyrise.thinhme.tech` (hoặc domain khác).

## Prerequisites

- Domain trỏ về host (DNS A/CNAME đã active)
- HTTPS termination (Vercel/Railway tự xử lý; nếu self-hosted dùng Caddy/Nginx + Let's Encrypt)
- Postgres (đang dùng Supabase — giữ nguyên)
- Google Cloud project có OAuth client + Drive API enabled

---

## 1. Environment variables

Tạo `.env.production` (không commit). Bắt buộc:

```env
# Server
NODE_ENV=production
PORT=3000

# Postgres (Supabase)
SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
SUPABASE_DB_URL_TX=postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres

# Auth
JWT_SECRET=<random-256bit-hex>
ADMIN_DEFAULT_PASSWORD=<strong-password>   # used trên migration đầu

# Public base URL — phải khớp domain prod
PUBLIC_BASE_URL=https://easyrise.thinhme.tech

# Google Drive
GOOGLE_CLIENT_ID=<from-cloud-console>
GOOGLE_CLIENT_SECRET=<from-cloud-console>
GOOGLE_REFRESH_TOKEN=<after-first-oauth>
DRIVE_ROOT_FOLDER_ID=<root-folder-id>

# AI provider (Claude/OpenAI/Anthropic gateway)
CLAUDE_API_KEY=<key>
CLAUDE_API_URL=https://api.loadip.com         # hoặc gateway của bạn
CLAUDE_SDK_TYPE=anthropic                     # hoặc openai
CLAUDE_MODEL=claude-sonnet-4-20250514

# Speech-to-Text (Whisper) — student speaking grading
WHISPER_BASE_URL=https://api.groq.com/openai/v1
WHISPER_API_KEY=gsk_<groq-key>
WHISPER_MODEL=whisper-large-v3-turbo

# Optional alerts
DISCORD_WEBHOOK_URL=<discord-webhook-or-empty>
```

> [!NOTE]
> `WHISPER_*` có thể set qua Admin Settings UI sau khi deploy thay vì env. Chỉ cần ENV cho secrets thực sự (DB, Drive, AI).

---

## 2. Google Cloud — OAuth redirect URI

> [!IMPORTANT]
> Thiếu bước này thì re-auth Drive sẽ fail với `redirect_uri_mismatch`.

1. Mở https://console.cloud.google.com → APIs & Services → Credentials
2. Mở OAuth 2.0 Client ID đang dùng
3. Authorized redirect URIs → **Add URI**: `https://easyrise.thinhme.tech/api/admin/drive/callback`
4. Save

Verify bằng admin: vào `/admin/drive.html` → Production readiness card → tất cả ✓.

---

## 3. Migration

```bash
# Trên prod host
SUPABASE_DB_URL=$SUPABASE_DB_URL_TX npm run migrate
```

Sẽ apply migrations 003a, 003, 100-124. Idempotent — chạy nhiều lần không sao.

---

## 4. First-time Drive auth

1. Deploy app, đảm bảo `PUBLIC_BASE_URL` đã set
2. Login admin tại `https://easyrise.thinhme.tech/admin`
3. Settings → đặt `publicBaseUrl` = domain prod (cũng có thể qua Admin Settings UI)
4. Mở `/admin/drive.html` → click **Re-auth**
5. Popup → login Google → Allow
6. Token mới sẽ ghi vào DB (encrypted) hoặc env tùy hosting

---

## 5. Whisper — Speaking grading

Vào Admin → Settings → group **Speech-to-Text**:

```
whisperBaseUrl = https://api.groq.com/openai/v1
whisperApiKey  = gsk_<your-key>
whisperModel   = whisper-large-v3-turbo
```

Free tier Groq cho phép ~14400 phút/ngày — đủ cho lớp ~200 học viên.

---

## 6. Smoke test

```bash
# Health
curl https://easyrise.thinhme.tech/api/health
# {"ok":true,"db":"connected","uptime":...}

# IELTS counts
curl https://easyrise.thinhme.tech/api/ielts/tests | jq 'length'
# Should be > 0

# Drive readiness (admin)
curl -H "Authorization: Bearer <admin-jwt>" \
  https://easyrise.thinhme.tech/api/admin/drive/readiness | jq '.score'
# Should be like "8/8"
```

UI flows cần test thủ công:
- [ ] Đăng ký tài khoản mới → nhận email (nếu có) → đăng nhập
- [ ] Vào `/ielts/` → click vào 4 skill cards
- [ ] Reading: làm 1 đề ngắn → submit → xem band
- [ ] Listening: nghe audio → submit
- [ ] Writing: nhập essay → AI chấm
- [ ] Speaking: ghi âm → transcribe → AI chấm
- [ ] My Results: xem aggregated timeline

---

## 7. Cron jobs trên prod

Daily backup tự chạy mỗi 24h từ lúc server start (`lib/backup.js`). Mirror sang Drive folder `easyrevise-backups` (giữ 30 ngày).

Drive health check mỗi 6h (`lib/drive-health.js`).

> [!WARNING]
> Nếu hosting dùng auto-sleep (Heroku free, Render free), backup cron sẽ không chạy. Vercel functions cũng không phù hợp cho cron persistent. Cần Railway/Fly/VPS.

---

## 8. Rollback

```bash
git revert HEAD~1                  # nếu commit cuối hỏng
# Hoặc:
git checkout <previous-commit-hash>
git push --force-with-lease
```

Postgres rollback chỉ thông qua backup JSON từ Drive (`easyrevise-backups`).

---

## 9. Monitoring

- Drive health: `/admin/drive.html` → Lịch sử check
- Backup status: Drive → folder `easyrevise-backups` → file `db.YYYY-MM-DD.json`
- Logs: tùy hosting (Vercel logs, Railway dashboard, hoặc `pm2 logs`)
- Errors: `pino` ghi ra stdout — pipe vào loki/datadog nếu cần

---

## 10. Troubleshooting

| Vấn đề | Khắc phục |
|---|---|
| `redirect_uri_mismatch` khi re-auth | Thêm URI vào Google Cloud (mục 2) |
| PDFs preview không hiện | Vào Kho Media → bấm **Đồng bộ** để reconcile |
| Speaking transcribe lỗi 401 | Check `whisperApiKey` trong Admin Settings |
| AI grading lỗi 429 | Tăng quota provider hoặc giảm rate limit (`migrations/121`) |
| Drive token expired | `/admin/drive.html` → Re-auth |
| Backup không xuất hiện trên Drive | Check `DRIVE_ROOT_FOLDER_ID` + service tài khoản có quyền write |

---

## Status checklist before launch

- [ ] DNS resolved tới host
- [ ] HTTPS cert active
- [ ] All env vars set (mục 1)
- [ ] OAuth redirect URI registered (mục 2)
- [ ] Migrations applied (mục 3)
- [ ] First-time Drive auth done (mục 4)
- [ ] Whisper key configured (mục 5) — optional but blocks Speaking AI
- [ ] Smoke tests passing (mục 6)
- [ ] Backup cron verified (Drive folder `easyrevise-backups` có file mới sau 24h)
- [ ] `/admin/drive.html` Production readiness = 8/8
