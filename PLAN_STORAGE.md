# EasyRevise — Kế Hoạch Storage & Kho Media (Media Library)

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào **Nhật ký thay đổi**.
> Last updated: 2026-03-27T04:50+07:00

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

### 2. Tạo Google Cloud Project + Service Account
```
1. Vào https://console.cloud.google.com
2. Tạo Project mới → "EasyRevise"
3. API & Services → Bật "Google Drive API"
4. IAM & Admin → Service Accounts → Tạo mới
   Tên: easyrevise-media
   → Tải file JSON key → đặt tên: service-account.json
   → Để cạnh server.js
5. Google Drive → Tạo folder "EasyRevise" → Share
   → Paste email Service Account (xxx@xxx.iam.gserviceaccount.com)
   → Quyền: Editor
```

### 3. Thêm vào `.env`
```env
# Google Drive
GOOGLE_SA_KEY_FILE=./service-account.json
DRIVE_ROOT_FOLDER_ID=ID_folder_EasyRevise_tren_Drive

# Storage mode: 'local' hoặc 'drive'
STORAGE_MODE=drive
```

### 4. Cài thêm 1 package
```bash
npm install googleapis
```

---

## 📌 Lưu ý Migration (2026-03-27)

Hiện tại ảnh upload qua hàm `uploadSingleImage(file)` trong `admin.js` → gọi `POST /api/upload` → lưu vào `public/uploads/`.

**Khi migrate sang Drive**, cần cập nhật các nơi sau trong `admin.js`:

| Hàm | Upload vào | Ghi chú |
|---|---|---|
| `addQuestionImage(file)` | `questionImages[]` | Ảnh câu hỏi |
| `addExplanationImage(file)` | `explanationImages[]` | Ảnh giải thích (vừa thêm Ctrl+V + toolbar 📷) |
| `uploadOptionImage(idx, file)` | `optionImages[idx]` | Ảnh từng đáp án A/B/C/D |
| `uploadImageFile(file)` | `questionImageUrl` (legacy) | Ảnh đơn cũ |

Tất cả đều gọi qua `uploadSingleImage(file)` → **chỉ cần sửa 1 hàm này** khi switch sang Drive.

```js
// Cần sửa từ:
async function uploadSingleImage(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', ...);
    return data.url;
}

// Thành: (gọi /api/media/upload thay vì /api/upload)
async function uploadSingleImage(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/media/upload', ...);
    return data.url; // Drive streaming URL
}
```

---

## ✅ Danh sách Task

---

### TASK 0 — Khởi tạo Drive client trong server.js

```js
// Thêm vào đầu server.js (sau các require hiện có):

let _driveClient = null;
function getDrive() {
    if (_driveClient) return _driveClient;
    if (process.env.STORAGE_MODE !== 'drive') return null;
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
        keyFile: path.resolve(__dirname, process.env.GOOGLE_SA_KEY_FILE || 'service-account.json'),
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    _driveClient = google.drive({ version: 'v3', auth });
    return _driveClient;
}

function readMedia() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'media.json'), 'utf-8')); }
    catch { return { folders: [], files: [] }; }
}
function writeMedia(data) {
    fs.writeFileSync(path.join(__dirname, 'data', 'media.json'), JSON.stringify(data, null, 2));
}

// Upload 1 file (buffer) lên Drive, trả về driveFileId
async function uploadBufferToDrive(buffer, filename, mimeType, driveFolderId) {
    const drive = getDrive();
    if (!drive) return null;
    const { Readable } = require('stream');
    const res = await drive.files.create({
        requestBody: { name: filename, parents: [driveFolderId] },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id'
    });
    return res.data.id;
}

// Tạo thư mục trên Drive, trả về driveFolderId
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

// Stream file từ Drive về client (cho video)
async function streamFileFromDrive(fileId, res) {
    const drive = getDrive();
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    response.data.pipe(res);
}
```

**Checklist:**
- [ ] Thêm đoạn code trên vào `server.js` sau phần `require()` hiện có
- [ ] Tạo file `data/media.json` rỗng: `{ "folders": [], "files": [] }`

---

### TASK 1 — API routes cho Kho Media

Thêm các routes sau vào `server.js`:

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
- [ ] Thêm tất cả routes trên vào `server.js`
- [ ] Test tạo thư mục → kiểm tra Drive có thư mục mới
- [ ] Test upload ảnh → kiểm tra ảnh nén xong trong kho
- [ ] Test upload PDF → kiểm tra file trong kho
- [ ] Test upload video → status "converting" ngay → sau vài phút → "ready"
- [ ] Test `/api/media/:fileId` → trả về file đúng
- [ ] Test xóa file → file biến khỏi kho và Drive

---

### TASK 2 — Tab "📁 Kho Media" trong Admin Panel

Thêm tab mới vào `admin/index.html` và `admin.js`:

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
- [ ] `admin/index.html`: Thêm tab "📁 Kho Media" vào nav
- [ ] `admin/index.html` hoặc `admin.js`: Render UI grid kho media
- [ ] `admin.js`: `loadMedia()` → GET `/api/admin/media` → render folders + files
- [ ] `admin.js`: `createMediaFolder(name)` → POST → reload
- [ ] `admin.js`: `deleteMediaFolder(id)` → confirm → DELETE → reload
- [ ] `admin.js`: `uploadMediaFile(file, folderId)` → POST FormData → reload
- [ ] `admin.js`: `deleteMediaFile(id)` → confirm → DELETE → reload
- [ ] `admin.js`: Poll status cho video đang "converting" (mỗi 5s check đến khi "ready")
- [ ] `admin.js`: Multi-select ảnh với tick checkbox, single-select video/PDF/DOCX
- [ ] `admin.js`: Nút **đổi tên** (✏️) trên mỗi file/thư mục → PATCH API
- [ ] `admin.js`: Nút "🤖 Đọc AI" trên PDF → switch tab AI Generate + pre-load file

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
- [ ] `admin/index.html`: Thêm nút "📁 Chọn từ kho" vào modalQuestion (cạnh ảnh, video, attachment)
- [ ] `admin.js`: `openMediaPicker(mode, callback)` → mở media modal với filter + mode
- [ ] `admin.js`: Khi confirm chọn → callback điền vào đúng field (images[], video url, attachment url)
- [ ] `admin.js`: Trong popup chọn từ kho có nút **"+ Upload thêm"** → upload file mới ngay trong popup, xong tự reload danh sách (không cần ra tab riêng)
- [ ] `admin/index.html`: Thêm field "Tài liệu đính kèm (PDF/DOCX)" vào modalQuestion

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
- [ ] `server.js`: Thêm route `POST /api/admin/media/scan-pending`
- [ ] Thêm `DRIVE_FOLDER_PENDING` vào `.env`
- [ ] `admin.js`: Nút "🔍 Quét thư mục pending" trong tab Kho Media → gọi route trên
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
Bước 0 (Người): Cài ffmpeg + tạo Service Account + thêm .env
  → (5-15 phút thủ công, không code)

Bước code:
  Task 0 → Drive client init     (~30 phút)
  Task 1 → API routes            (~2 giờ)
  Task 2 → Tab Kho Media UI      (~2 giờ)
  Task 3 → Popup chọn từ kho     (~1.5 giờ)
  Task 4 → Watcher pending/      (~1 giờ)
  Task 5 → Migration script      (~30 phút)

Test toàn bộ:
  → Upload ảnh → hiện trong kho → gắn vào câu hỏi → học sinh thấy ảnh
  → Upload video → đang xử lý → xong → gắn vào câu hỏi → học sinh xem được
  → Upload PDF → gắn vào câu hỏi → học sinh xem → AI đọc được
```

---

## ⚠️ Lưu ý quan trọng

1. `service-account.json` **KHÔNG được commit lên git** — thêm vào `.gitignore`
2. `STORAGE_MODE=local` vẫn hoạt động bình thường — rollback bất cứ lúc nào
3. Với file video lớn (> 200MB): upload từ web có thể chậm — dùng Task 4 (bỏ vào Drive pending)
4. Không cần xóa `/uploads/` cũ ngay — giữ cho đến khi migration xong và đã verify

---

## � Conflict Analysis & Quyết định thiết kế

> **Sub-agent PHẢI đọc phần này trước khi code**

### Conflict 1: AI đọc ảnh từ kho Drive ✅ Đã có giải pháp

**Vấn đề:** Hiện tại AI đọc ảnh bằng `fs.readFileSync('/uploads/hinh.jpg')` — không đọc được địa chỉ web `/api/media/DRIVE_FILE_ID`.

**Giải pháp:** Thêm hàm helper sau vào `server.js`, dùng ở **mọi chỗ** AI cần đọc ảnh:

```js
async function fetchImageBuffer(urlOrPath) {
    // Ảnh mới từ Drive: /api/media/DRIVE_FILE_ID
    const driveMatch = (urlOrPath || '').match(/^\/api\/media\/([a-zA-Z0-9_-]+)$/);
    if (driveMatch) {
        const drive = getDrive();
        if (drive) {
            const res = await drive.files.get(
                { fileId: driveMatch[1], alt: 'media' },
                { responseType: 'arraybuffer' }
            );
            return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] || 'image/jpeg' };
        }
    }
    // Ảnh cũ từ local: /uploads/filename.jpg
    const localMatch = (urlOrPath || '').match(/^\/uploads\/(.+)$/);
    if (localMatch) {
        const localPath = path.join(__dirname, 'public', 'uploads', localMatch[1]);
        if (fs.existsSync(localPath)) {
            return { buffer: fs.readFileSync(localPath), mimeType: 'image/jpeg' };
        }
    }
    return null;
}
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

## �📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| _(chưa có)_ | — | Chờ bắt đầu |
