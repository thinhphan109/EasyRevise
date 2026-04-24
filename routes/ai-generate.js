// routes/ai-generate.js — AI exam generation + AI extract QB + cache recovery
// ⚠️ Largest route file — includes streaming, retry logic, image crop, PDF processing
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { readSettings, readQuestionBank, writeQuestionBank, uuidv4 } = require('../lib/data');
const { adminOnly } = require('../lib/auth');
const { chatCompletion, getConfig, getAvailableModels, imageContent } = require('../lib/ai-client');

// Multer for AI files (PDF, images, DOCX)
const aiUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Chỉ hỗ trợ PDF, ảnh (JPG/PNG), hoặc DOCX'));
    }
});

// Subject-specific prompt hints
const SUBJECT_PROMPTS = {
    'english': 'Đây là đề thi Tiếng Anh. Chú ý: pronunciation, stress pattern, grammar, vocabulary, reading comprehension, writing. Giải thích bằng tiếng Việt, có ví dụ và quy tắc ngữ pháp.',
    'math': 'Đây là đề thi Toán học. Chú ý: giải chi tiết từng bước, ghi rõ công thức áp dụng. Sử dụng ký hiệu LaTeX cho công thức: $...$ cho inline, $$...$$ cho block. VD: $\\\\frac{a}{b}$, $\\\\sqrt{x}$, $x^2$. Nếu là trắc nghiệm, giải thích tại sao các đáp án khác sai.',
    'physics': 'Đây là đề thi Vật lý. Chú ý: ghi rõ công thức, đơn vị, giải thích hiện tượng vật lý liên quan. Nếu có bài tính toán, trình bày lời giải chi tiết.',
    'chemistry': 'Đây là đề thi Hóa học. Chú ý: phương trình hóa học phải cân bằng, ghi rõ điều kiện phản ứng, giải thích cơ chế nếu cần.',
    'biology': 'Đây là đề thi Sinh học. Chú ý: giải thích cơ chế sinh học, sử dụng thuật ngữ chính xác, mở rộng kiến thức liên quan đến chương trình.',
    'history': 'Đây là đề thi Lịch sử. Chú ý: ghi rõ mốc thời gian, sự kiện, nhân vật liên quan. Giải thích bối cảnh và ý nghĩa lịch sử.',
    'geography': 'Đây là đề thi Địa lý. Chú ý: dữ liệu thống kê, vị trí địa lý, đặc điểm tự nhiên/kinh tế. Giải thích mối liên hệ giữa các yếu tố.',
    'literature': 'Đây là đề thi Ngữ văn. Chú ý: phân tích tác phẩm, biện pháp tu từ, ý nghĩa nội dung và nghệ thuật. Đề viết luận cần có bài mẫu.',
    'it': 'Đây là đề thi Tin học. Chú ý: thuật toán, cấu trúc dữ liệu, lập trình. Giải thích rõ logic và có ví dụ minh họa.',
    'auto': 'Tự phát hiện môn học từ nội dung đề thi và giải thích phù hợp.'
};

// POST /api/admin/ai-generate
router.post('/ai-generate', adminOnly, aiUpload.array('files', 10), async (req, res) => {
    try {
        const { title, subject, year, subjectType, sdkType: reqSdkType, model: reqModel } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Vui lòng upload ít nhất 1 file' });
        }

        // Process files
        const contentParts = []; // text parts
        const imageParts = [];  // base64 image parts for vision

        for (const file of files) {
            if (file.mimetype === 'application/pdf') {
                try {
                    const pdfData = await pdfParse(file.buffer);
                    if (pdfData.text && pdfData.text.trim().length > 50) {
                        contentParts.push(`[PDF: ${file.originalname}]\n${pdfData.text}`);
                        console.log(`PDF text extracted: ${pdfData.text.length} chars`);
                    }
                } catch (e) { /* silent — may be a scanned PDF */ }

                try {
                    const { pdfToPng } = require('pdf-to-png-converter');
                    const pages = await pdfToPng(file.buffer, {
                        disableFontFace: true,
                        useSystemFonts: true,
                        viewportScale: 1.5,
                        pagesToProcess: [1, 2, 3, 4, 5]
                    });
                    console.log(`PDF ${file.originalname}: ${pages.length} pages converted to images`);
                    for (const page of pages) {
                        const compressed = await sharp(page.content)
                            .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 82 })
                            .toBuffer();
                        const base64 = compressed.toString('base64');
                        imageParts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
                        console.log(`  Page ${page.pageNumber}: ${(compressed.length / 1024).toFixed(0)}KB`);
                    }
                } catch (pdfImgErr) {
                    console.error(`PDF→image error for ${file.originalname}:`, pdfImgErr.message);
                }
            } else if (file.mimetype.startsWith('image/')) {
                try {
                    const resized = await sharp(file.buffer)
                        .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();
                    const base64 = resized.toString('base64');
                    console.log(`Image ${file.originalname}: ${(file.buffer.length / 1024).toFixed(0)}KB → ${(resized.length / 1024).toFixed(0)}KB`);
                    imageParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
                    });
                } catch (imgErr) {
                    console.error('Image resize error:', imgErr.message);
                    const base64 = file.buffer.toString('base64');
                    imageParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: file.mimetype, data: base64 }
                    });
                }
            } else if (file.mimetype.includes('wordprocessingml')) {
                try {
                    const result = await mammoth.extractRawText({ buffer: file.buffer });
                    contentParts.push(`[DOCX: ${file.originalname}]\n${result.value}`);
                } catch (e) {
                    contentParts.push(`[DOCX: ${file.originalname}] - Không đọc được nội dung.`);
                }
            }
        }

        const extractedText = contentParts.join('\n\n---\n\n');

        if (!extractedText.trim() && imageParts.length === 0) {
            const failedFiles = files.map(f => f.originalname).join(', ');
            return res.status(400).json({
                error: `Không trích xuất được nội dung từ file: ${failedFiles}. Thử upload ảnh chụp đề thi thay vì PDF.`,
                detail: 'Server không đọc được text và không chuyển được PDF sang ảnh. Có thể PDF bị mã hóa hoặc thiếu thư viện pdf-to-png-converter.'
            });
        }

        const subjectHint = SUBJECT_PROMPTS[subjectType || 'auto'] || SUBJECT_PROMPTS['auto'];

        const systemPrompt = `Bạn là trợ lý AI chuyên tạo đề thi cho hệ thống EasyRevise. 
${subjectHint}

QUY TẮC BẮT BUỘC:
1. Phát hiện tự động loại section từ các loại sau:
   - "multiple-choice": câu trắc nghiệm 4 lựa chọn A/B/C/D
   - "reading": đọc hiểu, có đoạn văn (passage) kèm câu hỏi trắc nghiệm
   - "writing-choice": viết có lựa chọn đáp án
   - "writing-essay": viết luận, tự do
   - "fill-in-blank": điền vào chỗ trống ___, dùng khi đề có dạng: điền từ, điền số, hoàn thành câu
   - "free-form": câu tự luận có nhiều phần a, b, c (yêu cầu lời giải)
2. Nếu đề CÓ đáp án → sử dụng đáp án đó
3. Nếu đề KHÔNG CÓ đáp án → tự giải và cung cấp correctAnswer chính xác
4. correctAnswer: 0=A, 1=B, 2=C, 3=D
5. "explanation": giải thích chi tiết bằng tiếng Việt, dễ hiểu cho học sinh cấp trung học
6. "expansion": kiến thức mở rộng liên quan (quy tắc, công thức, cấu trúc, ví dụ thêm)
7. Với reading: bao gồm trường "passage" chứa đoạn văn/bài đọc
8. Với writing-essay: bao gồm "prompt", "cues" (array), "sampleAnswer"
9. Với fill-in-blank: mỗi câu có trường "blanks": [{"index":0,"answer":"...","type":"text|int|float|fraction|dropdown","alternatives":[],"caseSensitive":false,"dropdownOptions":[],"tolerance":0.01}]
   - Câu hỏi dùng ___ để đánh dấu chỗ trống
   - type="dropdown": phải có dropdownOptions (array các lựa chọn)
   - type="fraction": HS nhập phân số như "3/4", so sánh giá trị số
   - alternatives: mảng các đáp án thay thế cũng đúng
10. Với free-form: mỗi câu có trường "subParts": [{"label":"a","question":"...","sampleAnswer":"..."}]
11. Các section phải theo đúng thứ tự trong đề gốc
12. ID câu hỏi bắt đầu từ 1 và tăng dần liên tục

HÌNH ẢNH/BIỂU ĐỒ TRONG ĐỀ:
- Nếu câu hỏi CÓ hình vẽ, sơ đồ hình học → thêm trường "imageRegion"
- imageRegion: { "imageIndex": 0, "topPercent": %, "heightPercent": %, "description": "mô tả chi tiết" }

BẢNG SỐ LIỆU TRONG ĐỀ:
- Nếu câu hỏi CÓ bảng số liệu → thêm trường "table"
- table: { "headers": ["Cột 1", "Cột 2", ...], "rows": [[giá trị,...], ...] }
- Ví dụ bảng 4x8 không có header → headers=[] và rows có 4 mảng, mỗi mảng 8 phần tử
- Nếu bảng có header (hàng đầu là tiêu đề) → headers chứa tiêu đề, rows chứa dữ liệu
- QUAN TRỌNG: trích xuất CHÍNH XÁC mọi giá trị trong bảng

CÔNG THỨC TOÁN (QUAN TRỌNG - BẮT BUỘC):
- PHẢI dùng LaTeX cho mọi công thức toán học:
  * Inline: $...$ — VD: $x^2 + 2x + 1 = 0$, $\\\\sqrt{x}$, $\\\\frac{a}{b}$
  * Block: $$...$$ — VD: $$\\\\frac{a}{b} = c$$, $$\\\\sum_{i=1}^{n} i = \\\\frac{n(n+1)}{2}$$
- KHÔNG dùng: x^2, sqrt(x), x² (unicode superscript), phân số dạng a/b thuần text
- Ví dụ đúng: "Phương trình $x^2 - 5x + 6 = 0$ có hai nghiệm $x_1, x_2$"
- Ví dụ đúng: "Diện tích hình tròn $S = \\\\pi r^2$"

OUTPUT: Chỉ trả về JSON, không có text giải thích bên ngoài.
SCHEMA:
{
  "_format": "easyrevise-exam-v1",
  "exam": {
    "title": "Tên đề thi",
    "subject": "Tên môn",
    "year": "Năm học",
    "sections": [
      {
        "title": "Tên phần",
        "instruction": "Hướng dẫn",
        "type": "multiple-choice|reading|writing-choice|writing-essay|fill-in-blank|free-form",
        "passage": "(nếu reading)",
        "questions": [
          {
            "id": 1,
            "question": "Nội dung câu hỏi (dùng ___ cho fill-in-blank)",
            "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
            "correctAnswer": 0,
            "explanation": "Giải thích chi tiết",
            "expansion": "Kiến thức mở rộng",
            "blanks": [{"index": 0, "answer": "goes", "type": "text", "alternatives": ["walks"], "caseSensitive": false}, {"index": 1, "answer": "3/4", "type": "fraction", "tolerance": 0.001}, {"index": 2, "answer": "went", "type": "dropdown", "dropdownOptions": ["go", "went", "gone", "going"]}],
            "subParts": [{"label": "a", "question": "Tính...", "sampleAnswer": "..."}],
            "table": { "headers": [], "rows": [[1,0,3,0,5,3,2,1],[0,1,2,4,1,2,3,4]] },
            "imageRegion": { "imageIndex": 0, "topPercent": 60, "heightPercent": 30, "description": "Mô tả hình" }
          }
        ]
      }
    ]
  }
}`;

        // Build user message content
        const userContent = [];

        for (const img of imageParts) {
            userContent.push(img);
        }

        let textPrompt = 'Phân tích nội dung đề thi dưới đây và tạo JSON theo format EasyRevise.\n\n';
        if (title) textPrompt += `Tên đề: ${title}\n`;
        if (subject) textPrompt += `Môn: ${subject}\n`;
        if (year) textPrompt += `Năm học: ${year}\n`;
        textPrompt += '\nNỘI DUNG ĐỀ THI:\n';
        if (extractedText.trim()) {
            textPrompt += extractedText;
        } else if (imageParts.length > 0) {
            textPrompt += '(Nội dung đề thi nằm trong các ảnh đính kèm phía trên)';
        }
        userContent.push({ type: 'text', text: textPrompt });

        const cfg = getConfig();
        const settingsData = readSettings();
        const model = reqModel || settingsData.generateModel || cfg.defaultModel;

        if (!cfg.apiKey) {
            return res.status(500).json({ error: 'API_KEY_FIXED (hoặc CLAUDE_API_KEY) chưa được cấu hình trong .env' });
        }

        console.log(`[AI] Provider: ${cfg.providerName} | Model: ${model} | SDK: ${cfg.sdkType}`);

        // Convert imageParts from Anthropic format → OpenAI format for new provider
        const convertedContent = userContent.map(p => {
            if (p.type === 'image') {
                return { type: 'image_url', image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } };
            }
            return p;
        });

        // Retry logic (3 attempts)
        let aiText = '';
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[AI] Attempt ${attempt}/${MAX_RETRIES}...`);
                aiText = await chatCompletion({
                    model,
                    maxTokens: 64000,
                    timeout: 10 * 60 * 1000,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: convertedContent }
                    ]
                });
                break;
            } catch (apiErr) {
                console.error(`[AI] Error (attempt ${attempt}):`, apiErr.message);
                if (attempt < MAX_RETRIES) {
                    console.log('[AI] Retrying in 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    return res.status(502).json({ error: `Lỗi từ AI API sau ${MAX_RETRIES} lần thử`, detail: apiErr.message });
                }
            }
        }

        // Parse JSON from response
        let jsonStr = aiText;
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        const jsonStart = jsonStr.indexOf('{');
        const jsonEnd = jsonStr.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            return res.status(422).json({
                error: 'AI trả về JSON không hợp lệ. Vui lòng thử lại.',
                raw: aiText.substring(0, 2000)
            });
        }

        if (!parsed._format || !parsed.exam || !parsed.exam.sections) {
            return res.status(422).json({
                error: 'AI trả về JSON không đúng format EasyRevise.',
                data: parsed
            });
        }

        if (title) parsed.exam.title = title;
        if (subject) parsed.exam.subject = subject;
        if (year) parsed.exam.year = year;

        // Post-process: crop imageRegion from original images
        if (imageParts.length > 0) {
            const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'ai-images');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            for (const section of parsed.exam.sections) {
                if (!section.questions) continue;
                for (const q of section.questions) {
                    if (q.imageRegion && typeof q.imageRegion.imageIndex === 'number') {
                        try {
                            const imgIdx = Math.min(q.imageRegion.imageIndex, imageParts.length - 1);
                            const imgData = Buffer.from(imageParts[imgIdx].source.data, 'base64');
                            const metadata = await sharp(imgData).metadata();

                            const top = Math.round((q.imageRegion.topPercent / 100) * metadata.height);
                            const height = Math.round((q.imageRegion.heightPercent / 100) * metadata.height);
                            const cropTop = Math.max(0, Math.min(top, metadata.height - 1));
                            const cropHeight = Math.min(height, metadata.height - cropTop);

                            if (cropHeight > 10) {
                                const cropped = await sharp(imgData)
                                    .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
                                    .jpeg({ quality: 85 })
                                    .toBuffer();

                                const filename = `q${q.id}_${Date.now()}.jpg`;
                                fs.writeFileSync(path.join(uploadsDir, filename), cropped);
                                q.imageUrl = `/uploads/ai-images/${filename}`;
                                console.log(`Cropped image for Q${q.id}: ${filename} (${(cropped.length / 1024).toFixed(0)}KB)`);
                            }
                        } catch (cropErr) {
                            console.error(`Failed to crop image for Q${q.id}:`, cropErr.message);
                        }
                    }
                }
            }
        }

        // Cache before sending
        const AI_CACHE_FILE = path.join(__dirname, '..', 'data', 'ai-gen-cache.json');
        try {
            fs.writeFileSync(AI_CACHE_FILE, JSON.stringify({
                success: true, data: parsed, cachedAt: new Date().toISOString()
            }, null, 2));
            console.log('[AI Cache] Saved result to', AI_CACHE_FILE);
        } catch (cacheErr) {
            console.error('[AI Cache] Write error:', cacheErr.message);
        }

        res.json({ success: true, data: parsed });

    } catch (err) {
        console.error('AI Generate error:', err);
        res.status(500).json({ error: 'Lỗi server khi xử lý AI: ' + err.message });
    }
});

// POST /api/admin/ai-extract-questions
router.post('/ai-extract-questions', adminOnly, aiUpload.array('files', 10), async (req, res) => {
    try {
        const { subject, tags } = req.body;
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ error: 'Vui lòng upload file' });

        const imageParts = [];
        const contentParts = [];
        for (const file of files) {
            if (file.mimetype === 'application/pdf') {
                try {
                    const pdfData = await pdfParse(file.buffer);
                    if (pdfData.text && pdfData.text.trim().length > 50) contentParts.push(`[PDF: ${file.originalname}]\n${pdfData.text}`);
                } catch (e) { }
                try {
                    const { pdfToPng } = require('pdf-to-png-converter');
                    const pages = await pdfToPng(file.buffer, { disableFontFace: true, useSystemFonts: true, viewportScale: 1.5, pagesToProcess: [1, 2, 3, 4, 5] });
                    for (const page of pages) {
                        const compressed = await sharp(page.content).resize({ width: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
                        imageParts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: compressed.toString('base64') } });
                    }
                } catch (e) { console.error('PDF→image error:', e.message); }
            } else if (file.mimetype.startsWith('image/')) {
                try {
                    const resized = await sharp(file.buffer).resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
                    imageParts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: resized.toString('base64') } });
                } catch (e) { }
            }
        }

        if (!imageParts.length && !contentParts.length) return res.status(400).json({ error: 'Không thể đọc file' });

        const extractPrompt = `Đọc đề thi trong ảnh/text bên dưới. Tách TỪNG câu hỏi riêng lẻ ra JSON array.

Mỗi câu có dạng:
{
  "question": "Nội dung câu hỏi",
  "sectionType": "multiple-choice|fill-in-blank|writing-essay|free-form",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctAnswer": 0,
  "blanks": [{"index":0,"answer":"...","type":"text"}],
  "explanation": "Giải thích",
  "difficulty": "easy|medium|hard",
  "tags": ["tag1", "tag2"]
}

Quy tắc:
- correctAnswer: 0=A, 1=B, 2=C, 3=D
- Nếu câu trắc nghiệm: có options[] và correctAnswer
- Nếu câu điền khuyết: dùng ___ trong question, có blanks[]
- Nếu câu tự luận: sectionType = "writing-essay", không cần options
- Tự xác định difficulty và tags phù hợp
- explanation: giải thích chi tiết bằng tiếng Việt

Trả về JSON THUẦN TÚY (không markdown, không \`\`\`json):
{"questions": [...]}`;

        const userContent = [];
        if (contentParts.length) userContent.push({ type: 'text', text: contentParts.join('\n\n') });
        imageParts.forEach(img => userContent.push(img));
        userContent.push({ type: 'text', text: 'Hãy tách tất cả câu hỏi trong đề thi trên thành JSON array.' });

        const cfg = getConfig();
        const settingsData2 = readSettings();
        const extractModel = settingsData2.generateModel || cfg.defaultModel;

        // Convert to OpenAI image_url format
        const extractContent = userContent.map(p => {
            if (p.type === 'image') {
                return { type: 'image_url', image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } };
            }
            return p;
        });

        console.log(`[AI Extract] Provider: ${cfg.providerName} | Model: ${extractModel}`);
        const result = await chatCompletion({
            model: extractModel,
            maxTokens: 8000,
            temperature: 0.2,
            messages: [
                { role: 'system', content: extractPrompt },
                { role: 'user', content: extractContent }
            ]
        });

        // Parse JSON
        let cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const jsonMatch2 = cleaned.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (!jsonMatch2) return res.status(500).json({ error: 'AI không trả về JSON hợp lệ' });

        const parsed2 = JSON.parse(jsonMatch2[0]);
        const questions = (parsed2.questions || []).map(q => ({
            ...q,
            subject: subject || '',
            tags: [...(q.tags || []), ...(tags ? tags.split(',').map(t => t.trim()) : [])],
            source: 'ai-extract'
        }));

        res.json({ success: true, questions, count: questions.length });
    } catch (err) {
        console.error('AI extract error:', err);
        res.status(500).json({ error: err.message || 'Lỗi AI' });
    }
});

// POST /api/admin/ai-ocr — single page OCR via configured AI provider
router.post('/ai-ocr', adminOnly, express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'Thiếu imageBase64' });

        const cfg = getConfig();
        const settingsData = readSettings();
        const ocrModel = settingsData.generateModel || cfg.defaultModel;

        const ocrPrompt = `Hãy chuyển đổi toàn bộ nội dung trong hình ảnh này thành văn bản có cấu trúc. YÊU CẦU ĐẶC BIỆT:
1. Bảng biểu: BẮT BUỘC chuyển đổi thành mã LaTeX.
2. Công thức toán học: Sử dụng mã LaTeX chuẩn để tương thích hoàn toàn với tính năng Toggle TeX của MathType trong Word. Dùng đúng 1 dấu $ cho công thức trên cùng dòng và 2 dấu $$ cho công thức đứng riêng. TUYỆT ĐỐI KHÔNG thêm khoảng trắng ở sát bên trong dấu $. Không dùng dư dấu $.
3. Định dạng: Các Tiêu đề, Số thứ tự Câu phải in đậm bằng Markdown (ví dụ: **Câu 1:**).
4. Hình ảnh minh hoạ/Sơ đồ: BẮT BUỘC phát hiện hộp bao quanh (bounding box) của từng hình ảnh thật và xuất ra thẻ [IMG_BBOX: ymin, xmin, ymax, xmax] chuẩn hóa thang 1000.
5. QUAN TRỌNG: TUYỆT ĐỐI BỎ QUA CÁC HÌNH ẢNH WATERMARK. KHÔNG trích xuất bounding box cho watermark.
Chỉ trả về nội dung văn bản kết quả.`;

        console.log(`[AI OCR] Provider: ${cfg.providerName} | Model: ${ocrModel}`);

        const result = await chatCompletion({
            model: ocrModel,
            maxTokens: 6000,
            temperature: 0.1,
            messages: [
                { role: 'user', content: [
                    { type: 'text', text: ocrPrompt },
                    { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } }
                ]}
            ]
        });

        // Clean up markdown code blocks
        let cleaned = result
            .replace(/```(?:latex|tex|math)?\n?/g, '')
            .replace(/```/g, '')
            .replace(/\${3,}/g, '$$');

        res.json({ success: true, text: cleaned });
    } catch (err) {
        console.error('AI OCR error:', err);
        res.status(500).json({ error: err.message || 'Lỗi AI OCR' });
    }
});

// GET /api/admin/ai-last-result — cache recovery
const AI_CACHE_FILE_PATH = path.join(__dirname, '..', 'data', 'ai-gen-cache.json');

router.get('/ai-last-result', adminOnly, (req, res) => {
    try {
        if (!fs.existsSync(AI_CACHE_FILE_PATH))
            return res.status(404).json({ error: 'Chưa có kết quả cache nào' });
        const cached = JSON.parse(fs.readFileSync(AI_CACHE_FILE_PATH, 'utf-8'));
        if (!cached.data) return res.status(404).json({ error: 'Cache không hợp lệ' });
        const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
        const ageMin = Math.round(ageMs / 60000);
        if (ageMs > 24 * 60 * 60 * 1000)
            return res.status(410).json({ error: 'Cache đã hết hạn (24 giờ)' });
        console.log(`[AI Cache] Recovery request — cache ${ageMin} min old`);
        res.json({ ...cached, ageMinutes: ageMin });
    } catch (e) {
        res.status(500).json({ error: 'Lỗi đọc cache: ' + e.message });
    }
});

module.exports = router;
