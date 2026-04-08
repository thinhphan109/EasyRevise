# EasyRevise — Kế Hoạch Storage & Kho Media (Media Library)

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào **Nhật ký thay đổi**.
> Last updated: 2026-04-08T16:04+07:00
> **Kiến trúc:** Modular (routes/ + lib/ + js/ modules) — KHÔNG thêm code vào server.js/admin.js
> **Auth:** OAuth2 (Client ID + Secret + Refresh Token) — KHÔNG dùng Service Account

---

## 🎯 Mục tiêu

Xây dựng **Kho Media tập trung** trong Admin Panel, lưu trữ mọi file trên Google Drive:

- Tạo thư mục phân loại → Drive tự có thư mục tương ứng
- Upload ảnh/video/PDF/DOCX → tự nén → tự lên Drive
- Video bỏ tay vào Drive → hệ thống tự detect → tự convert → vào kho
- Khi soạn câu hỏi → bấm "Chọn từ kho" → popup kho → chọn xong → tự điền vào form
- PDF/DOCX: gắn vào câu hỏi cho học sinh xem, copy link, hoặc cho AI đọc tạo đề

---

## 🗂️ Cấu trúc dữ liệu

### File mới: `data/media.json`
```json
{
  "folders": [
    {
      "id": "uuid-folder-1",
      "name": "Đề thi GK1",
      "driveId": "GOOGLE_DRIVE_FOLDER_ID",
      "createdAt": "2026-03-27T..."
    }
  ],
  "files": [
    {
      "id": "uuid-file-1",
      "name": "hinh_cau5.jpg",
      "type": "image",
      "folderId": "uuid-folder-1",
      "driveFileId": "GOOGLE_DRIVE_FILE_ID",
      "url": "/api/media/GOOGLE_DRIVE_FILE_ID",
      "size": 123456,
      "mimeType": "image/jpeg",
      "createdAt": "2026-03-27T...",
      "status": "ready"
    },
    {
      "id": "uuid-file-2",
      "name": "bai_giang.mp4",
      "type": "video",
      "folderId": "uuid-folder-1",
      "driveFileId": "GOOGLE_DRIVE_FILE_ID",
      "url": "/api/media/GOOGLE_DRIVE_FILE_ID",
      "originalName": "bai_giang.ts",
      "size": 52000000,
      "mimeType": "video/mp4",
      "createdAt": "2026-03-27T...",
      "status": "ready"
    }
  ]
}
```

**`status` của file:**
- `"ready"` — đã có thể dùng
- `"converting"` — video đang được chuyển đổi
- `"error"` — lỗi, cần upload lại

---

## 🔧 Cài đặt trước khi code

### 1. Cài ffmpeg trên máy đang chạy server

```powershell
# Windows (chọn 1 trong 2):
winget install Gyan.FFmpeg
# hoặc:
choco install ffmpeg

# Kiểm tra:
ffmpeg -version
```

### 2. ✅ ĐÃ SETUP — OAuth2 Authentication (2026-04-08)
```
✅ Google Cloud Project: EasyRevise
✅ Google Drive API: Enabled
✅ OAuth2 Client ID + Secret: Đã tạo
✅ OAuth Consent Screen: Testing mode + test user added
✅ Refresh Token: Đã lấy qua get-drive-token.js
✅ Drive Folder: EasyRevise-Media (ID: 1VA-qLGCeTrmZyfdQZm2nsMhPPBH89hDp)
✅ Test: Upload + Delete file thành công

⚠️ KHÔNG dùng Service Account (SA không có storage quota cho Gmail cá nhân)
```

### 3. `.env` (đã cấu hình)
```env
# === Google Drive Storage (OAuth2) ===
DRIVE_ROOT_FOLDER_ID=1VA-qLGCeTrmZyfdQZm2nsMhPPBH89hDp
STORAGE_MODE=drive
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REFRESH_TOKEN=1//xxx
```

### 4. ✅ Package đã cài
```bash
npm install googleapis  # ✅ Done
```

---

## 📌 Lưu ý Migration (cập nhật 2026-04-08)

> **⚠️ Admin frontend đã modular hóa** (Phase 7 Refactor)
> - `admin.js` cũ đã bị XÓA
> - Code upload nằm trong `public/admin/js/helpers.js` và `js/questions.js`

Hiện tại ảnh upload qua hàm `uploadSingleImage(file)` trong **`js/helpers.js`** → gọi `POST /api/upload` → lưu vào `public/uploads/`.

**Khi migrate sang Drive**, cần cập nhật trong **`js/helpers.js`**:

| Hàm | File | Upload vào |
|---|---|---|
| `uploadSingleImage(file)` | `js/helpers.js` | Gọi `/api/upload` (hiện tại) |
| `addQuestionImage(file)` | `js/questions.js` | `questionImages[]` |
| `addExplanationImage(file)` | `js/questions.js` | `explanationImages[]` |
| `uploadOptionImage(idx, file)` | `js/questions.js` | `optionImages[idx]` |

Tất cả đều gọi qua `uploadSingleImage(file)` → **chỉ cần sửa 1 hàm này**:

```js
// js/helpers.js — sửa endpoint:
async function uploadSingleImage(file) {
    const formData = new FormData(); formData.append('file', file);
    const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });
    const data = await res.json();
    return data.file?.url; // Drive proxy URL: /api/media/DRIVE_FILE_ID
}
```

---

## ✅ Danh sách Task

---

### TASK 0 — Tạo `lib/drive.js` + cập nhật `lib/data.js`

> ⚠️ **KHÔNG thêm code vào server.js** — tạo file riêng

#### File mới: `lib/drive.js`
```js
// lib/drive.js — Google Drive OAuth2 client + helpers
const { google } = require('googleapis');
const { Readable } = require('stream');

let _driveClient = null;

function getDrive() {
    if (_driveClient) return _driveClient;
    if (process.env.STORAGE_MODE !== 'drive') return null;

    // OAuth2 (Gmail cá nhân — có storage quota)
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    _driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    return _driveClient;
}

// Upload buffer lên Drive, trả về driveFileId
async function uploadBufferToDrive(buffer, filename, mimeType, driveFolderId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.create({
        requestBody: { name: filename, parents: [driveFolderId || process.env.DRIVE_ROOT_FOLDER_ID] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id'
    });
    return res.data.id;
}

// Tạo thư mục trên Drive
async function createDriveFolder(name, parentId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId || process.env.DRIVE_ROOT_FOLDER_ID]
        },
        fields: 'id'
    });
    return res.data.id;
}

// Xóa file khỏi Drive
async function deleteFromDrive(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.files.delete({ fileId }).catch(() => {});
}

// Stream file về client (video)
async function streamFileFromDrive(fileId, res) {
    const drive = getDrive();
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    response.data.pipe(res);
}

// Lấy buffer file từ Drive (cho AI đọc ảnh, proxy ảnh/PDF)
async function getFileBuffer(fileId) {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] };
}

// Set video public (để embed iframe) + chặn download/print
async function setVideoPublicNoDL(fileId) {
    const drive = getDrive();
    if (!drive) return;
    await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' }
    });
    await drive.files.update({
        fileId,
        requestBody: { copyRequiresWriterPermission: true }
    });
}

// Lấy quota info
async function getDriveQuota() {
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.about.get({ fields: 'storageQuota' });
    return res.data.storageQuota;
}

// Helper: fetch ảnh từ URL local hoặc Drive (cho AI routes)
async function fetchImageBuffer(urlOrPath) {
    const path = require('path');
    const fs = require('fs');
    // Drive: /api/media/DRIVE_FILE_ID
    const driveMatch = (urlOrPath || '').match(/^\/api\/media\/([a-zA-Z0-9_-]{10,})$/);
    if (driveMatch) return getFileBuffer(driveMatch[1]);
    // Local: /uploads/filename.jpg
    const localMatch = (urlOrPath || '').match(/^\/uploads\/(.+)$/);
    if (localMatch) {
        const localPath = path.join(__dirname, '..', 'public', 'uploads', localMatch[1]);
        if (fs.existsSync(localPath)) return { buffer: fs.readFileSync(localPath), mimeType: 'image/jpeg' };
    }
    return null;
}

module.exports = {
    getDrive, uploadBufferToDrive, createDriveFolder,
    deleteFromDrive, streamFileFromDrive, getFileBuffer,
    setVideoPublicNoDL, getDriveQuota, fetchImageBuffer
};
```

#### Cập nhật: `lib/data.js` — thêm readMedia/writeMedia
```js
// Thêm vào lib/data.js:
const MEDIA_FILE = path.join(__dirname, '..', 'data', 'media.json');

function readMedia() {
    try {
        if (!fs.existsSync(MEDIA_FILE)) fs.writeFileSync(MEDIA_FILE, JSON.stringify({ folders: [], files: [] }, null, 2));
        return JSON.parse(fs.readFileSync(MEDIA_FILE, 'utf-8'));
    } catch (err) { return { folders: [], files: [] }; }
}

function writeMedia(data) { fs.writeFileSync(MEDIA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

// Thêm vào exports:
module.exports = { ...existing, readMedia, writeMedia, MEDIA_FILE };
```

**Checklist:**
- [ ] Tạo file `lib/drive.js` với code OAuth2 ở trên
- [ ] Cập nhật `lib/data.js` — thêm readMedia/writeMedia + MEDIA_FILE
- [ ] Tạo file `data/media.json` rỗng: `{ "folders": [], "files": [] }`
- [ ] Verify: `require('./lib/drive').getDrive()` trả về drive client

---

### TASK 1 — API routes cho Kho Media

> ⚠️ Tạo file mới `routes/media-library.js` — KHÔNG thêm vào server.js
> Mount trong `server.js`: `app.use('/api', require('./routes/media-library'));`

Tất cả routes dùng `router.get/post/...` thay vì `app.get/post/...`:

#### 1a. Lấy danh sách toàn bộ kho
```js
app.get('/api/admin/media', adminOnly, (req, res) => {
    res.json(readMedia());
});
```

#### 1b. Tạo thư mục mới
```js
app.post('/api/admin/media/folders', adminOnly, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu tên thư mục' });
    const media = readMedia();
    const driveId = await createDriveFolder(name);
    const folder = { id: uuidv4(), name, driveId, createdAt: new Date().toISOString() };
    media.folders.push(folder);
    writeMedia(media);
    res.json({ success: true, folder });
});
```

#### 1c. Đổi tên / xóa thư mục
```js
app.delete('/api/admin/media/folders/:id', adminOnly, async (req, res) => {
    const media = readMedia();
    const idx = media.folders.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    // Xóa Drive folder
    if (media.folders[idx].driveId) await deleteFromDrive(media.folders[idx].driveId);
    // Xóa toàn bộ file trong thư mục
    const filesToDelete = media.files.filter(f => f.folderId === req.params.id);
    for (const f of filesToDelete) { if (f.driveFileId) await deleteFromDrive(f.driveFileId); }
    media.files = media.files.filter(f => f.folderId !== req.params.id);
    media.folders.splice(idx, 1);
    writeMedia(media);
    res.json({ success: true });
});
```

#### 1d. Upload file vào kho
```js
// Dùng multer memoryStorage (không ghi ra disk)
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

app.post('/api/admin/media/upload', adminOnly, mediaUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const folderId = req.body.folderId || null;
    const media = readMedia();
    const folder = folderId ? media.folders.find(f => f.id === folderId) : null;
    const driveFolderId = folder?.driveId || process.env.DRIVE_ROOT_FOLDER_ID;

    const fileType = req.file.mimetype.startsWith('image/') ? 'image'
        : req.file.mimetype.startsWith('video/') ? 'video'
        : req.file.mimetype === 'application/pdf' ? 'pdf'
        : req.file.mimetype.includes('word') || req.file.originalname?.endsWith('.docx') ? 'docx'
        : 'other';

    const fileRecord = {
        id: uuidv4(),
        name: req.file.originalname,
        type: fileType,
        folderId,
        driveFileId: null,
        url: null,
        size: req.file.size,
        mimeType: req.file.mimetype,
        createdAt: new Date().toISOString(),
        status: fileType === 'video' ? 'converting' : 'ready'
    };
    media.files.push(fileRecord);
    writeMedia(media);

    if (fileType === 'image') {
        // Nén ảnh bằng sharp trước khi upload
        const compressed = await sharp(req.file.buffer)
            .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        const fname = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}.jpg`;
        const driveFileId = await uploadBufferToDrive(compressed, fname, 'image/jpeg', driveFolderId);
        const idx = media.files.findIndex(f => f.id === fileRecord.id);
        media.files[idx].driveFileId = driveFileId;
        media.files[idx].url = `/api/media/${driveFileId}`;
        media.files[idx].status = 'ready';
        writeMedia(media);
        return res.json({ success: true, file: media.files[idx] });
    }

    if (fileType === 'pdf' || fileType === 'docx' || fileType === 'other') {
        const fname = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
        const driveFileId = await uploadBufferToDrive(req.file.buffer, fname, req.file.mimetype, driveFolderId);
        const idx = media.files.findIndex(f => f.id === fileRecord.id);
        media.files[idx].driveFileId = driveFileId;
        media.files[idx].url = `/api/media/${driveFileId}`;
        media.files[idx].status = 'ready';
        writeMedia(media);
        return res.json({ success: true, file: media.files[idx] });
    }

    if (fileType === 'video') {
        // Trả về ngay, xử lý video async ở background
        res.json({ success: true, file: fileRecord, message: 'Video đang được xử lý...' });
        setImmediate(() => convertAndUploadVideo(req.file.buffer, req.file.originalname, fileRecord.id, driveFolderId));
        return;
    }
});

async function convertAndUploadVideo(buffer, originalName, fileRecordId, driveFolderId) {
    const os = require('os');
    const ext = path.extname(originalName).toLowerCase();
    const tmpIn = path.join(os.tmpdir(), `easyrevise_in_${fileRecordId}${ext}`);
    const tmpOut = path.join(os.tmpdir(), `easyrevise_out_${fileRecordId}.mp4`);
    try {
        fs.writeFileSync(tmpIn, buffer);
        await new Promise((resolve, reject) => {
            const cmd = ext === '.m3u8'
                ? `ffmpeg -y -protocol_whitelist file,http,https,tcp,tls,crypto -i "${tmpIn}" -c copy "${tmpOut}"`
                : `ffmpeg -y -i "${tmpIn}" -c:v libx264 -c:a aac -movflags +faststart "${tmpOut}"`;
            require('child_process').exec(cmd, (err, _, stderr) => err ? reject(new Error(stderr)) : resolve());
        });
        const mp4Buffer = fs.readFileSync(tmpOut);
        const newName = path.basename(originalName, ext) + '.mp4';
        const driveFileId = await uploadBufferToDrive(mp4Buffer, newName, 'video/mp4', driveFolderId);

        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === fileRecordId);
        if (idx !== -1) {
            media.files[idx].driveFileId = driveFileId;
            media.files[idx].url = `/api/media/${driveFileId}`;
            media.files[idx].name = newName;
            media.files[idx].mimeType = 'video/mp4';
            media.files[idx].status = 'ready';
            writeMedia(media);
        }
        console.log(`[Media] Video ready: ${newName}`);
    } catch (err) {
        console.error('[Media] Video convert error:', err.message);
        const media = readMedia();
        const idx = media.files.findIndex(f => f.id === fileRecordId);
        if (idx !== -1) { media.files[idx].status = 'error'; writeMedia(media); }
    } finally {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
}
```

#### 1e. Đổi tên file
```js
app.patch('/api/admin/media/files/:id', adminOnly, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu tên mới' });
    const media = readMedia();
    const idx = media.files.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    // Đổi tên trên Drive luôn
    if (media.files[idx].driveFileId) {
        const drive = getDrive();
        if (drive) await drive.files.update({ fileId: media.files[idx].driveFileId, requestBody: { name } });
    }
    media.files[idx].name = name;
    writeMedia(media);
    res.json({ success: true });
});
```

#### 1f. Đổi tên thư mục
```js
app.patch('/api/admin/media/folders/:id', adminOnly, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu tên mới' });
    const media = readMedia();
    const idx = media.folders.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    if (media.folders[idx].driveId) {
        const drive = getDrive();
        if (drive) await drive.files.update({ fileId: media.folders[idx].driveId, requestBody: { name } });
    }
    media.folders[idx].name = name;
    writeMedia(media);
    res.json({ success: true });
});
```

#### 1g. Xóa file
```js
app.delete('/api/admin/media/files/:id', adminOnly, async (req, res) => {
    const media = readMedia();
    const idx = media.files.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy' });
    if (media.files[idx].driveFileId) await deleteFromDrive(media.files[idx].driveFileId);
    media.files.splice(idx, 1);
    writeMedia(media);
    res.json({ success: true });
});
```

#### 1f. Proxy serve file từ Drive (ảnh, PDF, video stream)

> Dùng cho `/api/media/:driveFileId` — phục vụ file về browser mà không lộ Drive link

```js
const mediaRamCache = new Map();

app.get('/api/media/:fileId', async (req, res) => {
    const { fileId } = req.params;
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) return res.status(400).end();

    // Kiểm tra loại file từ media.json
    const media = readMedia();
    const fileRecord = media.files.find(f => f.driveFileId === fileId);
    const mimeType = fileRecord?.mimeType || 'application/octet-stream';

    // Video: stream trực tiếp (không cache vào RAM)
    if (mimeType.startsWith('video/')) {
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return streamFileFromDrive(fileId, res);
    }

    // Ảnh/PDF: cache RAM 1 giờ
    if (mediaRamCache.has(fileId)) {
        const cached = mediaRamCache.get(fileId);
        res.setHeader('Content-Type', cached.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(cached.buffer);
    }

    const drive = getDrive();
    const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buf = { buffer: Buffer.from(driveRes.data), mimeType: driveRes.headers['content-type'] || mimeType };
    mediaRamCache.set(fileId, buf);
    setTimeout(() => mediaRamCache.delete(fileId), 60 * 60 * 1000); // xóa sau 1h
    res.setHeader('Content-Type', buf.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf.buffer);
});
```

#### 1g. Kiểm tra trạng thái video đang convert
```js
app.get('/api/admin/media/status/:id', adminOnly, (req, res) => {
    const media = readMedia();
    const file = media.files.find(f => f.id === req.params.id);
    if (!file) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ status: file.status, url: file.url });
});
```

**Checklist Task 1:**
- [ ] Tạo `routes/media-library.js` với tất cả routes trên
- [ ] Mount trong `server.js`: `app.use('/api', require('./routes/media-library'))`
- [ ] Test tạo thư mục → kiểm tra Drive có thư mục mới
- [ ] Test upload ảnh → kiểm tra ảnh nén xong trong kho
- [ ] Test upload PDF → kiểm tra file trong kho
- [ ] Test upload video → status "converting" ngay → sau vài phút → "ready"
- [ ] Test `/api/media/:fileId` → trả về file đúng
- [ ] Test xóa file → file biến khỏi kho và Drive

---

### TASK 2 — Tab "📁 Kho Media" trong Admin Panel

> ⚠️ Tạo file mới `public/admin/js/media-library.js` — KHÔNG sửa admin.js (đã xóa)
> Thêm `<script src="js/media-library.js">` vào `index.html`

#### UI trong index.html (trong sidebar hoặc tab bar):
```html
<button class="tab-btn" onclick="switchTab('media')" data-tab="media">📁 Kho Media</button>
```

#### Giao diện tab Media (HTML):
```
┌──────────────────────────────────────────────┐
│  📁 Kho Media                     [+ Thư mục] │
│                                               │
│  THÊM FILE:  [🖼️ Ảnh] [🎬 Video] [📄 PDF/Doc]│
│                                               │
│  Thư mục:                                     │
│  [📁 Đề thi GK1] [📁 HK1] [📁 Toán] [Tất cả]│
│                                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 🖼️  │ │ 🎬  │ │ 📄  │ │ 🖼️  │        │
│  │ □   │ │      │ │      │ │ □   │        │
│  │anh1 │ │vid1  │ │pdf1  │ │anh2 │        │
│  └──────┘ └──────┘ └──────┘ └──────┘        │
│                                               │
│  Video đang xử lý: bai_giang.ts ⏳            │
└──────────────────────────────────────────────┘
```

#### Tính năng:
- Click 1 ảnh: chọn (highlight viền xanh)
- Click nhiều ảnh: multi-select (chỉ ảnh mới multi-select được)
- Click video/PDF: chọn ngay 1 cái
- Nút "Copy link" dưới mỗi file
- File video: hiện thêm nút "🖨️ Xem" → preview
- File PDF/DOCX: hiện thêm nút "🤖 Đọc AI" → mở tab AI Generate với file này

**Checklist Task 2:**
- [ ] `index.html`: Thêm tab "📁 Kho Media" vào nav + `<script src="js/media-library.js">`
- [ ] `js/media-library.js`: `loadMedia()` → GET `/api/admin/media` → render grid
- [ ] `js/media-library.js`: `createMediaFolder(name)` → POST → reload
- [ ] `js/media-library.js`: `deleteMediaFolder(id)` → confirm → DELETE → reload
- [ ] `js/media-library.js`: `uploadMediaFile(file, folderId)` → POST FormData → reload
- [ ] `js/media-library.js`: `deleteMediaFile(id)` → confirm → DELETE → reload
- [ ] `js/media-library.js`: Poll status video "converting" (mỗi 5s → "ready")
- [ ] `js/media-library.js`: Multi-select ảnh, single-select video/PDF
- [ ] `js/media-library.js`: Nút **đổi tên** (✏️) → PATCH API
- [ ] `js/media-library.js`: Nút "🤖 Đọc AI" trên PDF → switch tab AI Generate
- [ ] `js/media-library.js`: Drag & Drop zone cho upload (tương tự tab AI)

---

### TASK 3 — Popup "Chọn từ Kho" khi soạn câu hỏi

Khi đang soạn câu hỏi trong modal → bên cạnh nút upload ảnh hiện tại, thêm nút **"📁 Chọn từ kho"**.

#### Luồng:
```
Admin đang soạn câu hỏi
→ Bấm "📁 Chọn từ kho"
→ Popup Media Library bật lên (dạng modal đè lên modal câu hỏi)
→ Admin chọn ảnh (nhiều ảnh), hoặc chọn 1 video/PDF
→ Bấm "✅ Xác nhận"
→ Popup đóng
→ Ảnh tự thêm vào danh sách ảnh câu hỏi (images[])
→ Video tự điền vào field URL video
→ PDF tự điền vào field attachment
```

#### Nút thêm vào form câu hỏi (modalQuestion):
```html
<!-- Cạnh nút upload ảnh hiện tại -->
<button type="button" onclick="openMediaPicker('question-images')">📁 Chọn từ kho</button>

<!-- Cạnh field video URL -->
<button type="button" onclick="openMediaPicker('video')">📁 Chọn video từ kho</button>

<!-- Cạnh field PDF (mới) -->
<button type="button" onclick="openMediaPicker('attachment')">📁 Chọn PDF từ kho</button>
```

#### Hàm `openMediaPicker(mode)`:
```js
// mode: 'question-images' | 'video' | 'attachment'
function openMediaPicker(mode) {
    // Mở modal kho media với filter phù hợp
    // mode='question-images' → chỉ hiện ảnh, multi-select
    // mode='video' → chỉ hiện video, single-select
    // mode='attachment' → chỉ hiện PDF/DOCX, single-select
    // Khi confirm → gọi callback điền vào form
}
```

**Checklist Task 3:**
- [ ] `index.html`: Thêm nút "📁 Chọn từ kho" vào modalQuestion (cạnh ảnh, video, attachment)
- [ ] `js/media-library.js`: `openMediaPicker(mode, callback)` → mở media modal
- [ ] `js/media-library.js`: Khi confirm → callback điền vào đúng field
- [ ] `js/media-library.js`: Popup có nút **"+ Upload thêm"** → upload ngay trong popup
- [ ] `index.html`: Thêm field "Tài liệu đính kèm (PDF/DOCX)" vào modalQuestion

---

### TASK 4 — Level 3 Watcher: Bỏ file vào Drive → tự nhận

> Tùy chọn — dùng khi file quá lớn không muốn upload qua web

Thêm nút **"🔍 Quét thư mục pending"** trong tab Kho Media.

Khi bấm → server quét Drive folder `pending/` → đưa video mới vào queue convert.

```js
app.post('/api/admin/media/scan-pending', adminOnly, async (req, res) => {
    const drive = getDrive();
    if (!drive) return res.status(400).json({ error: 'Drive chưa kết nối' });
    const pendingFolderId = process.env.DRIVE_FOLDER_PENDING;
    if (!pendingFolderId) return res.status(400).json({ error: 'DRIVE_FOLDER_PENDING chưa cấu hình' });

    const { data } = await drive.files.list({
        q: `'${pendingFolderId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size)',
        pageSize: 20
    });

    const videoExts = ['.ts', '.m3u8', '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
    const videos = (data.files || []).filter(f => videoExts.some(e => f.name.toLowerCase().endsWith(e)));

    let queued = 0;
    for (const file of videos) {
        const media = readMedia();
        // Bỏ qua nếu đã có trong kho
        if (media.files.find(f => f.driveFileId === file.id || f.originalDriveId === file.id)) continue;

        // Download buffer từ Drive
        const dlRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(dlRes.data);

        // Thêm vào kho với status "converting"
        const targetFolderId = req.body.folderId || null;
        const targetFolder = targetFolderId ? media.folders.find(f => f.id === targetFolderId) : null;
        const driveFolderId = targetFolder?.driveId || process.env.DRIVE_ROOT_FOLDER_ID;

        const fileRecord = {
            id: uuidv4(), name: file.name, type: 'video', folderId: targetFolderId,
            driveFileId: null, originalDriveId: file.id, url: null,
            size: parseInt(file.size), mimeType: file.mimeType,
            createdAt: new Date().toISOString(), status: 'converting'
        };
        media.files.push(fileRecord);
        writeMedia(media);

        // Convert ngầm
        setImmediate(() => convertAndUploadVideo(buffer, file.name, fileRecord.id, driveFolderId));
        // Xóa khỏi pending
        await deleteFromDrive(file.id);
        queued++;
    }

    res.json({ success: true, queued, message: `Đã đưa ${queued} video vào hàng chờ xử lý` });
});
```

**Checklist Task 4:**
- [ ] `routes/media-library.js`: Thêm route `POST /admin/media/scan-pending`
- [ ] Thêm `DRIVE_FOLDER_PENDING` vào `.env`
- [ ] `js/media-library.js`: Nút "🔍 Quét thư mục pending" → gọi route trên
- [ ] Test: Bỏ file `.ts` vào Drive pending → bấm quét → video vào kho sau vài phút

---

### TASK 5 — Migration: Chuyển ảnh cũ từ `/uploads/` lên Drive

Chạy 1 lần duy nhất để đưa tất cả ảnh cũ lên Drive và cập nhật link trong `exams.json`.

```js
// Script: scripts/migrate-uploads-to-drive.js
// Chạy: node scripts/migrate-uploads-to-drive.js
```

> Chi tiết script xem trong file `scripts/migrate-uploads-to-drive.js` (tạo riêng khi cần).

**Checklist Task 5:**
- [ ] Tạo `scripts/migrate-uploads-to-drive.js`
- [ ] Chạy script sau khi Test Task 1-4 ổn định
- [ ] Backup `exams.json` trước khi chạy
- [ ] Verify ảnh hiển thị đúng sau migration

---

## 📋 Thứ tự thực hiện

```
Bước 0 (✅ DONE): Setup OAuth2 + Drive folder + googleapis
Bước 1 (Tùy chọn): Cài ffmpeg (chỉ cần nếu convert video)

Bước code:
  Task 0 → lib/drive.js + lib/data.js update       (~30 phút)
  Task 1 → routes/media-library.js                  (~2 giờ)
         → server.js mount route                    (~2 phút)
  Task 2 → js/media-library.js + index.html update  (~2.5 giờ)
  Task 3 → Popup chọn từ kho (js/media-library.js)  (~1.5 giờ)
  Task 4 → Watcher pending/ (routes/media-library)   (~1 giờ)
  Task 5 → Migration script                         (~30 phút)
  BONUS  → js/helpers.js: uploadSingleImage → Drive  (~15 phút)

File mới tạo:
  lib/drive.js                    ← Drive OAuth2 client + helpers
  routes/media-library.js         ← Tất cả media routes
  public/admin/js/media-library.js ← Tab Kho Media UI + Media Picker
  data/media.json                 ← Metadata (folders + files)

File cập nhật:
  lib/data.js                     ← thêm readMedia/writeMedia
  server.js                       ← mount media-library route
  public/admin/index.html         ← thêm tab + script tag
  public/admin/js/helpers.js      ← uploadSingleImage → /api/media/upload
  public/admin/js/admin-main.js   ← switchTab('media') handler

Test toàn bộ:
  → Upload ảnh → hiện trong kho → gắn vào câu hỏi → học sinh thấy ảnh
  → Upload video → đang xử lý → xong → embed iframe → học sinh xem (không tải được)
  → Upload PDF → gắn vào câu hỏi → học sinh xem → AI đọc được
  → Quota warning khi Drive gần đầy
```

---

## ⚠️ Lưu ý quan trọng

1. **OAuth2 credentials** (Client ID, Secret, Refresh Token) nằm trong `.env` — đã có trong `.gitignore`
2. `STORAGE_MODE=local` vẫn hoạt động bình thường — rollback bất cứ lúc nào
3. Với file video lớn (> 200MB): upload từ web có thể chậm — dùng Task 4 (bỏ vào Drive pending)
4. Không cần xóa `/uploads/` cũ ngay — giữ cho đến khi migration xong và đã verify
5. **Video bảo vệ nội dung:** Dùng `copyRequiresWriterPermission: true` + Drive iframe embed → HS không tải/in được
6. **KHÔNG thêm code vào server.js** — tạo file riêng trong `lib/` và `routes/`

---

## � Conflict Analysis & Quyết định thiết kế

> **Sub-agent PHẢI đọc phần này trước khi code**

### Conflict 1: AI đọc ảnh từ kho Drive ✅ Đã có giải pháp

**Vấn đề:** Hiện tại AI đọc ảnh bằng `fs.readFileSync('/uploads/hinh.jpg')` — không đọc được `/api/media/DRIVE_FILE_ID`.

**Giải pháp:** Hàm `fetchImageBuffer()` đã có trong `lib/drive.js` (xem TASK 0).

```js
// Dùng trong routes AI:
const { fetchImageBuffer } = require('../lib/drive');
const imgData = await fetchImageBuffer(question.imageUrl);
// imgData = { buffer, mimeType } hoặc null
```

**Nơi cần cập nhật dùng hàm này:**
- Route AI grade essay (đọc `submission.attachments[]`)
- Route AI generate — khi đọc `imageUrl` của câu hỏi để gửi AI xem lại (nếu có)

---

### Conflict 2: Video streaming không tua được ✅ Đã quyết định

**Vấn đề:** Proxy video từ Drive không hỗ trợ `HTTP Range` → học sinh không tua được.

**Quyết định:** Video **KHÔNG proxy** — dùng Drive iframe embed trực tiếp.

**Cách thực hiện khi upload video lên Drive:**
```js
// Sau khi upload video thành công, set quyền public (ai có link đều xem được):
await drive.permissions.create({
    fileId: newDriveFileId,
    requestBody: { role: 'reader', type: 'anyone' }
});
```

**URL video lưu vào media.json:**
```js
// Thay vì: url: '/api/media/' + fileId
url: `https://drive.google.com/file/d/${newDriveFileId}/preview`
// Khi hiển thị: nhúng iframe → Drive xử lý stream/tua tốt hơn VPS
```

**Route `/api/media/:fileId`** → giữ nguyên cho ảnh + PDF, nhưng **bỏ qua video** (video dùng Drive URL trực tiếp).

---

### Conflict 3: Upload file lớn timeout ✅ Đã quyết định

**Thêm vào route upload:**
```js
app.post('/api/admin/media/upload', adminOnly, (req, res, next) => {
    req.setTimeout(15 * 60 * 1000); // 15 phút timeout cho file lớn
    next();
}, mediaUpload.single('file'), async (req, res) => { ... });
```

---

### Quyết định tổng hợp cho sub-agent

| Loại file | Lưu trữ | Phục vụ học sinh | Drive permission |
|---|---|---|---|
| Ảnh | Drive | Proxy `/api/media/:id` (có cache RAM) | Private |
| Video | Drive (sau convert) | **iframe Drive** `drive.google.com/file/d/ID/preview` | **Public** (anyone with link) |
| PDF/DOCX | Drive | Proxy `/api/media/:id` | Private |
| Bài nộp HS | Drive | Proxy `/api/media/:id` (GV xem) | Private |

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-04-08T16:04 | Setup | ✅ OAuth2 setup hoàn tất. Test upload/delete thành công |
| 2026-04-08T16:04 | Plan Update | Cập nhật toàn bộ plan: SA→OAuth2, monolithic→modular, thêm video protection, thêm quota warning |
