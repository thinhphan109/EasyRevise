import {
  GradePoller,
  escapeHtml,
  renderMarkdown
} from "./chunk-6XWQOLBI.js";

// public/js/pages/result/state.js
var ResultState = class {
  constructor() {
    this.results = null;
    this.examData = null;
    this.questionsList = [];
    this.accessCode = null;
    this.userId = null;
  }
  /**
   * Load final result from sessionStorage and resolve access code.
   * Returns false if no saved result (caller should redirect).
   */
  loadSavedResult() {
    const saved = sessionStorage.getItem("easyrevise_final_result");
    if (!saved) return false;
    this.results = JSON.parse(saved);
    let accessCode = null;
    const resultCodeRaw = sessionStorage.getItem("easyrevise_result_code");
    if (resultCodeRaw) {
      try {
        const rc = JSON.parse(resultCodeRaw);
        if (rc.examId === this.results.examId) accessCode = rc.code;
      } catch (e) {
      }
    }
    if (!accessCode) {
      const unlockedLS = JSON.parse(localStorage.getItem("easyrevise_unlocked") || "{}");
      accessCode = unlockedLS[this.results.examId] || null;
    }
    this.accessCode = accessCode;
    try {
      this.userId = JSON.parse(localStorage.getItem("easyrevise_user") || "{}").id || null;
    } catch (e) {
      this.userId = null;
    }
    return true;
  }
  /**
   * Fetch full exam from API, then flatten sections into questionsList with type flags.
   */
  async fetchExamAndFlatten() {
    const headers = {};
    if (this.accessCode) headers["x-access-code"] = this.accessCode;
    const token = localStorage.getItem("easyrevise_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/exams/${this.results.examId}`, { headers });
    if (!res.ok) throw new Error("Exam not found");
    this.examData = await res.json();
    this.questionsList = [];
    this.examData.sections.forEach((section) => {
      if (section.type === "writing-essay") {
        this.questionsList.push({ ...section, isEssay: true, sectionTitle: section.title });
      } else if (section.type === "free-form") {
        const freeQuestions = section.questions && section.questions.length ? section.questions : section.subParts && section.subParts.length ? [{
          id: section.id,
          question: section.prompt || section.title || "",
          subParts: section.subParts,
          sampleAnswer: section.sampleAnswer || ""
        }] : [];
        freeQuestions.forEach((q) => {
          this.questionsList.push({
            ...q,
            isFreeForm: true,
            isEssay: false,
            sectionTitle: section.title,
            instruction: section.instruction || "",
            sectionPrompt: section.prompt || "",
            sectionSampleAnswer: section.sampleAnswer || "",
            cues: q.cues || section.cues || []
          });
        });
      } else if (section.type === "fill-in-blank") {
        (section.questions || []).forEach((q) => {
          this.questionsList.push({
            ...q,
            isFillBlank: true,
            isEssay: false,
            isFreeForm: false,
            sectionTitle: section.title
          });
        });
      } else {
        (section.questions || []).forEach((q) => {
          this.questionsList.push({ ...q, isEssay: false, sectionTitle: section.title });
        });
      }
    });
  }
  hasGradeable() {
    return this.questionsList.some((q) => q.isEssay || q.isFreeForm || q.isFillBlank);
  }
};

// public/js/pages/result/summary.js
function renderSummary(state) {
  const { results, examData } = state;
  const scoreEl = document.getElementById("scoreValue");
  const correctEl = document.getElementById("correctCount");
  const incorrectEl = document.getElementById("incorrectCount");
  const skipEl = document.getElementById("skipCount");
  const examDateEl = document.getElementById("examDate");
  const timeEl = document.getElementById("timeSpent");
  if (scoreEl) scoreEl.textContent = results.score;
  if (correctEl) correctEl.textContent = results.correct;
  if (incorrectEl) incorrectEl.textContent = results.incorrect;
  if (skipEl) skipEl.textContent = results.skipped;
  if (examDateEl) examDateEl.textContent = `Ho\xE0n th\xE0nh v\xE0o: ${results.timestamp}`;
  if (timeEl && results.timeSpent) {
    const min = Math.floor(results.timeSpent / 60);
    const sec = results.timeSpent % 60;
    timeEl.textContent = `${min} ph\xFAt ${sec} gi\xE2y`;
  }
  if (scoreEl) {
    const s = parseFloat(results.score);
    scoreEl.classList.remove("score-high", "score-mid", "score-low");
    if (s >= 8) scoreEl.classList.add("score-high");
    else if (s >= 5) scoreEl.classList.add("score-mid");
    else scoreEl.classList.add("score-low");
  }
  const retakeBtn = document.getElementById("retakeBtn");
  if (retakeBtn) {
    if (examData.requireCode) {
      retakeBtn.textContent = "\u{1F511} Nh\u1EADp m\xE3 \u0111\u1EC3 l\xE0m l\u1EA1i";
      retakeBtn.href = "#";
      retakeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const unlocked = JSON.parse(localStorage.getItem("easyrevise_unlocked") || "{}");
        delete unlocked[results.examId];
        localStorage.setItem("easyrevise_unlocked", JSON.stringify(unlocked));
        window.location.href = "/";
      });
    } else {
      retakeBtn.href = `exam.html?id=${results.examId}`;
    }
  }
}

// public/js/pages/result/blank-checker.js
function checkBlankMatch(given, expected, type, blank) {
  given = (given || "").trim();
  expected = (expected || "").trim();
  if (!given) return false;
  const tolerance = blank && blank.tolerance || void 0;
  if (type === "int") return parseInt(given) === parseInt(expected);
  if (type === "float") return Math.abs(parseFloat(given) - parseFloat(expected)) <= (tolerance || 0.01);
  if (type === "fraction") {
    const evalFrac = (s) => {
      const p = String(s).split("/");
      return p.length === 2 ? parseFloat(p[0]) / parseFloat(p[1]) : parseFloat(s);
    };
    const gv = evalFrac(given), ev = evalFrac(expected);
    if (isNaN(gv) || isNaN(ev)) return false;
    return Math.abs(gv - ev) <= (tolerance || 1e-3);
  }
  const caseSensitive = blank && blank.caseSensitive;
  const normalize = (s) => caseSensitive ? s.trim() : s.trim().toLowerCase();
  const allCorrect = [expected, ...blank && blank.alternatives ? blank.alternatives : []].filter((a) => a);
  return allCorrect.some((ans) => normalize(given) === normalize(ans));
}

// public/js/pages/result/media.js
function buildVideoHtml(url) {
  if (!url) return "";
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
            <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
        </div>`;
  }
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
            <iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
        </div>`;
  }
  return `<video controls style="max-width:100%;border-radius:12px;margin-top:0.5rem;" preload="metadata"><source src="${url}"></video>`;
}
function buildHeroImageHtml(src, maxHeight = 350) {
  return `<div style="margin:0.75rem 0;"><img src="${src}" alt="" style="max-width:100%;max-height:${maxHeight}px;border-radius:12px;cursor:zoom-in;object-fit:contain;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:100%;max-height:${maxHeight}px;border-radius:12px;cursor:zoom-in;object-fit:contain';}"></div>`;
}
function buildThumbnailGridHtml(srcs, maxW = 200, maxH = 160, alt = "H\xECnh") {
  let html = `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">`;
  srcs.forEach((src, i) => {
    html += `<img src="${src}" alt="${alt} ${i + 1}" style="max-width:${maxW}px;max-height:${maxH}px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
  });
  html += `</div>`;
  return html;
}
function buildMediaHtml(item, opts = {}) {
  const isExpl = !!opts.explanation;
  const imageField = isExpl ? "explanationImages" : "images";
  const legacyField = isExpl ? "explanationImage" : "image";
  const videoField = isExpl ? "explanationVideo" : "video";
  const maxHeight = isExpl ? 400 : 350;
  const altPrefix = isExpl ? "\u1EA2nh gi\u1EA3i \u0111\xE1p" : "H\xECnh";
  const imgs = [];
  if (item[imageField] && item[imageField].length > 0) imgs.push(...item[imageField]);
  else if (item[legacyField]) imgs.push(item[legacyField]);
  if (!isExpl && item.imageUrl && !imgs.includes(item.imageUrl)) imgs.push(item.imageUrl);
  let html = "";
  if (imgs.length === 1) html += buildHeroImageHtml(imgs[0], maxHeight);
  else if (imgs.length > 1) html += buildThumbnailGridHtml(imgs, isExpl ? 220 : 200, isExpl ? 180 : 160, altPrefix);
  if (item[videoField]) html += buildVideoHtml(item[videoField]);
  return html;
}

// public/js/pages/result/status-badge.js
function buildStatusBadge(q, resultEntry) {
  const userAnsId = resultEntry ? resultEntry.userAnswer : void 0;
  if (q.isEssay) {
    return '<span class="status-badge" style="background: rgba(99,102,241,0.2); color: #818cf8;">\u270D\uFE0F Ph\u1EA7n Vi\u1EBFt</span>';
  }
  if (q.isFreeForm) {
    return '<span class="status-badge" style="background: rgba(168,85,247,0.15); color: #a855f7;">\u270F\uFE0F T\u1EF1 Lu\u1EADn</span>';
  }
  if (q.isFillBlank) {
    const blanks = q.blanks || [];
    const ansMap = resultEntry?.userAnswer || {};
    const fillAllCorrect = blanks.length > 0 && blanks.every((b, i) => {
      const uv = ((ansMap[i] !== void 0 ? ansMap[i] : "") + "").trim();
      return checkBlankMatch(uv, String(b.answer || "").trim(), b.type, b);
    });
    const fillAnyAnswered = blanks.some((_, i) => (ansMap[i] + "").trim() !== "");
    if (!fillAnyAnswered) return '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">\u26A0\uFE0F B\u1ECF Qua</span>';
    if (fillAllCorrect) return '<span class="status-badge badge-correct">\u2705 Ch\xEDnh X\xE1c</span>';
    return '<span class="status-badge badge-incorrect">\u274C Ch\u01B0a \u0110\xFAng</span>';
  }
  if (userAnsId === void 0) {
    return '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">\u26A0\uFE0F B\u1ECF Qua</span>';
  }
  if (userAnsId === q.correctAnswer) {
    return '<span class="status-badge badge-correct">\u2705 Ch\xEDnh X\xE1c</span>';
  }
  return '<span class="status-badge badge-incorrect">\u274C Ch\u01B0a \u0110\xFAng</span>';
}

// public/js/pages/result/review-list.js
function renderFreeFormResponse(q, resultEntry) {
  const subParts = q.subParts || [];
  const userAnswerText = resultEntry?.userAnswer || "";
  const attachments = resultEntry?.attachments || [];
  const partLines = userAnswerText ? userAnswerText.split("\n") : [];
  const buildPartExplHtml = (p) => {
    let h = "";
    if (p.explanation) {
      h += `<div style="margin-top:0.6rem;padding:0.6rem 0.85rem;background:rgba(99,102,241,0.05);border-left:3px solid rgba(99,102,241,0.35);border-radius:0 8px 8px 0;font-size:0.88rem;color:var(--text-main);" class="katex-render">${renderMarkdown(p.explanation)}</div>`;
    }
    const imgs = [];
    if (p.explanationImages && p.explanationImages.length > 0) imgs.push(...p.explanationImages);
    else if (p.explanationImage) imgs.push(p.explanationImage);
    if (imgs.length === 1) {
      h += `<div style="margin:0.4rem 0;"><img src="${imgs[0]}" alt="" style="max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain;" onclick="window.open('${imgs[0]}','_blank')"></div>`;
    } else if (imgs.length > 1) {
      h += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.4rem 0;">`;
      imgs.forEach((src, i) => {
        h += `<img src="${src}" alt="\u1EA2nh ${i + 1}" style="max-width:180px;max-height:140px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
      });
      h += `</div>`;
    }
    if (p.explanationVideo) h += buildVideoHtml(p.explanationVideo);
    return h;
  };
  const partsHtml = subParts.length > 0 ? subParts.map((p, i) => {
    const label = p.label ? `(${p.label})` : `C\xE2u ${i + 1}`;
    const ans = partLines[i] ? partLines[i].replace(/^[^:]+:\s*/, "") : "(ch\u01B0a \u0111i\u1EC1n)";
    const partExplHtml = buildPartExplHtml(p);
    const partSampleHtml = p.sampleAnswer ? `<div style="margin-top:0.4rem;padding:0.4rem 0.6rem;background:rgba(34,197,94,0.06);border-left:3px solid rgba(34,197,94,0.5);border-radius:0 6px 6px 0;font-size:0.82rem;color:var(--text-main);" class="katex-render">\u{1F4DD} ${renderMarkdown(p.sampleAnswer)}</div>` : "";
    const partQuestion = p.question ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.35rem;line-height:1.5;" class="katex-render">${renderMarkdown(p.question)}</div>` : "";
    return `<div style="padding:0.75rem 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:0.78rem;font-weight:700;color:var(--primary);margin-bottom:0.25rem;">${label}</div>
                ${partQuestion}
                <div style="display:flex;gap:0.5rem;align-items:center;margin:0.25rem 0;">
                    <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">B\xE0i l\xE0m:</span>
                    <span style="color:var(--text-main);font-size:0.92rem;font-weight:600;">${ans}</span>
                </div>
                ${partSampleHtml}
                ${partExplHtml}
            </div>`;
  }).join("") : `<div style="color:var(--text-muted);font-size:0.9rem;white-space:pre-line;">${escapeHtml(userAnswerText || "(ch\u01B0a l\xE0m b\xE0i)")}</div>`;
  const attachmentsHtml = attachments.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;">${attachments.map(
    (url) => url.endsWith(".pdf") ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">\u{1F4C4} PDF b\xE0i l\xE0m</a>` : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">`
  ).join("")}</div>` : "";
  return `
        <div style="margin-bottom:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:12px;">
            <div style="font-weight:600;color:var(--text-main);font-size:0.88rem;margin-bottom:0.5rem;">B\xE0i l\xE0m c\u1EE7a b\u1EA1n:</div>
            ${partsHtml}
            ${attachmentsHtml}
        </div>
        ${q.sampleAnswer ? `<div style="padding:1rem 1.25rem;background:rgba(34,197,94,0.05);border:1px dashed rgba(34,197,94,0.3);border-radius:12px;margin-bottom:1rem;">
            <strong style="color:var(--success);display:block;margin-bottom:0.5rem;">\u{1F4DD} H\u01B0\u1EDBng d\u1EABn / \u0110\xE1p \xE1n m\u1EABu:</strong>
            <div style="color:var(--text-main);font-size:0.92rem;white-space:pre-line;">${escapeHtml(q.sampleAnswer)}</div>
        </div>` : ""}
        ${q.explanationVideo ? `<div style="margin-top:0.75rem;"><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">\u{1F3AC} Video gi\u1EA3i \u0111\xE1p</div>${buildVideoHtml(q.explanationVideo)}</div>` : ""}
        <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
}
function renderFillBlankResponse(q, resultEntry) {
  const blanks = q.blanks || [];
  const userAnswerMap = resultEntry?.userAnswer || {};
  const rawQ = q.question || "";
  let parts;
  if (rawQ.includes("___")) parts = rawQ.split("___");
  else if (rawQ.includes("__")) parts = rawQ.split("__");
  else {
    parts = rawQ.split(/(?<!\S)_(?!\S)/);
    if (parts.length === 1) parts = rawQ.split("_");
  }
  let filledHtml = '<div style="font-size:1rem;line-height:2;color:var(--text-main);">';
  parts.forEach((part, i) => {
    filledHtml += `<span>${part.replace(/\n/g, "<br>")}</span>`;
    if (i < parts.length - 1) {
      const blank = blanks[i];
      const userVal = ((userAnswerMap[i] !== void 0 ? userAnswerMap[i] : "") + "").trim();
      const expected = String(blank?.answer || "").trim();
      const isOk = blank ? checkBlankMatch(userVal, expected, blank.type, blank) : false;
      filledHtml += `<span style="
                display:inline-block;padding:0.15rem 0.6rem;margin:0 0.2rem;
                border-radius:8px;font-weight:700;font-size:0.92rem;
                background:${isOk ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"};
                color:${isOk ? "#16a34a" : "#dc2626"};
                border:1px solid ${isOk ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"};
                ">${userVal || '<em style="opacity:0.6">(tr\u1ED1ng)</em>'} ${isOk ? "\u2713" : `\u2717 <span style="font-size:0.78rem;opacity:0.75;">\u2192 ${expected}</span>`}</span>`;
    }
  });
  filledHtml += "</div>";
  const allCorrect = blanks.length > 0 && blanks.every((b, i) => {
    const uv = ((userAnswerMap[i] !== void 0 ? userAnswerMap[i] : "") + "").trim();
    return checkBlankMatch(uv, String(b.answer || "").trim(), b.type, b);
  });
  const wrongCount = blanks.filter((b, i) => !checkBlankMatch(((userAnswerMap[i] !== void 0 ? userAnswerMap[i] : "") + "").trim(), String(b.answer || "").trim(), b.type, b)).length;
  return `
        <div style="margin-bottom:1.25rem;">
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">C\xE2u tr\u1EA3 l\u1EDDi c\u1EE7a b\u1EA1n</div>
            ${filledHtml}
            <div style="margin-top:0.5rem;font-size:0.82rem;color:${allCorrect ? "#16a34a" : "#dc2626"};font-weight:600;">
                ${allCorrect ? `\u2705 T\u1EA5t c\u1EA3 ${blanks.length} \xF4 \u0111\xFAng` : `\u274C Sai ${wrongCount}/${blanks.length} \xF4`}
            </div>
            <div id="grade-slot-${q.id}" class="grade-slot"></div>
        </div>`;
}
function renderMultipleChoiceResponse(q, resultEntry) {
  const userAnsId = resultEntry ? resultEntry.userAnswer : void 0;
  const letter = (idx) => ["A", "B", "C", "D"][Number(idx)] || "?";
  const optionText = (idx) => q.options && q.options[Number(idx)] !== void 0 ? q.options[Number(idx)] : "";
  const formatChoice = (idx) => {
    if (idx === void 0 || idx === null || idx === "") return '<span style="color:var(--text-muted);">Ch\u01B0a ch\u1ECDn</span>';
    return `<strong>${letter(idx)}.</strong> ${escapeHtml(optionText(idx) || "(kh\xF4ng c\xF3 n\u1ED9i dung)")}`;
  };
  const isCorrectChoice = userAnsId !== void 0 && Number(userAnsId) === Number(q.correctAnswer);
  return `
        <div style="margin-bottom:1.25rem;display:grid;gap:0.65rem;">
            <div style="padding:0.8rem 1rem;background:${isCorrectChoice ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"};border:1px solid ${isCorrectChoice ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)"};border-radius:12px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">B\u1EA1n \u0111\xE3 ch\u1ECDn</div>
                <div style="color:var(--text-main);font-size:0.95rem;">${formatChoice(userAnsId)}</div>
            </div>
            ${!isCorrectChoice ? `<div style="padding:0.8rem 1rem;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.28);border-radius:12px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">\u0110\xE1p \xE1n \u0111\xFAng</div>
                <div style="color:var(--text-main);font-size:0.95rem;">${formatChoice(q.correctAnswer)}</div>
            </div>` : ""}
        </div>`;
}
function renderEssayResponse(q, resultEntry) {
  const userAnswer = resultEntry?.userAnswer;
  const attachments = resultEntry?.attachments || [];
  const attachmentsHtml = attachments.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">${attachments.map(
    (url) => `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">${url.endsWith(".pdf") ? "\u{1F4C4} PDF b\xE0i l\xE0m" : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`}</a>`
  ).join("")}</div>` : "";
  return `
        <div style="margin-bottom: 1rem;">
            <strong style="color: var(--text-main); font-size: 0.9rem;">B\xE0i l\xE0m c\u1EE7a b\u1EA1n:</strong>
            <div style="margin-top: 0.5rem; padding: 1rem; background:rgba(255,255,255,0.03); border-radius: 12px; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line;">${escapeHtml(userAnswer) || "Kh\xF4ng c\xF3 b\xE0i l\xE0m."}</div>
            ${attachmentsHtml}
        </div>
        ${q.sampleAnswer ? `<div style="padding: 1.25rem; background: rgba(34,197,94,0.05); border: 1px dashed rgba(34,197,94,0.3); border-radius: 12px; margin-bottom: 1rem;">
            <strong style="color: var(--success); display: block; margin-bottom: 0.75rem;">\u{1F4DD} M\u1EABu \u0111\xE1p \xE1n:</strong>
            <div style="color: var(--text-main); font-size: 0.95rem; white-space: pre-line;">${escapeHtml(q.sampleAnswer)}</div>
        </div>` : ""}
        <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
}
function buildResponseRow(q, resultEntry) {
  if (q.isFreeForm) return renderFreeFormResponse(q, resultEntry);
  if (q.isFillBlank) return renderFillBlankResponse(q, resultEntry);
  if (q.isEssay) return renderEssayResponse(q, resultEntry);
  return renderMultipleChoiceResponse(q, resultEntry);
}
function renderReviewList({ state, container, onAskWhyWrong }) {
  container.innerHTML = "";
  state.questionsList.forEach((q, index) => {
    const resultEntry = state.results.results.find((r) => String(r.id) === String(q.id));
    const reviewItem = document.createElement("div");
    reviewItem.className = "glass-panel review-item";
    const statusBadge = buildStatusBadge(q, resultEntry);
    const responseRow = buildResponseRow(q, resultEntry);
    const questionMediaHtml = buildMediaHtml(q, { explanation: false });
    const explMediaHtml = buildMediaHtml(q, { explanation: true });
    const titleHtml = renderMarkdown(
      q.isEssay ? q.prompt || "" : q.isFreeForm ? q.question || q.prompt || q.sectionPrompt || q.instruction || "" : q.question || ""
    );
    const sectionLabel = q.isFreeForm || q.isEssay ? q.sectionTitle : `${q.sectionTitle} \u2014 C\xE2u ${index + 1}`;
    const showExplain = !q.isEssay && !q.isFreeForm && !q.isFillBlank && resultEntry && resultEntry.isCorrect === false;
    reviewItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
                    ${sectionLabel}
                </div>
                ${statusBadge}
            </div>
            <div style="font-size: 1.05rem; font-weight: 600; margin-bottom: 1.25rem; color: var(--text-main); line-height: 1.5;" class="katex-render">
                ${titleHtml}
            </div>
            ${questionMediaHtml}
            ${responseRow}
            ${q.explanation && q.showExplanation !== false ? `
            <div class="explanation-box">
                <div class="explanation-title">\u{1F4DD} Gi\u1EA3i \u0111\xE1p & Ph\xE2n t\xEDch</div>
                <div style="color: var(--text-main); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.explanation)}</div>
                ${explMediaHtml}
            </div>` : explMediaHtml && q.showExplanation !== false ? `<div class="explanation-box"><div class="explanation-title">\u{1F4DD} Media gi\u1EA3i \u0111\xE1p</div>${explMediaHtml}</div>` : ""}
            ${q.expansion && q.showExpansion !== false ? `
            <div class="expansion-box">
                <div class="expansion-title">\u{1F4A1} M\u1EDF r\u1ED9ng ki\u1EBFn th\u1EE9c</div>
                <div style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.expansion)}</div>
            </div>` : ""}
            ${showExplain ? `
            <div id="explain-slot-${q.id}">
                <button class="btn btn-sm" data-action="ask-why-wrong" data-question-id="${q.id}" style="margin-top:0.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;font-size:0.8rem;padding:0.4rem 0.9rem;border-radius:10px;cursor:pointer;transition:opacity 0.2s;" title="AI gi\u1EA3i th\xEDch t\u1EA1i sao b\u1EA1n sai">
                    \u{1F916} T\u1EA1i sao t\xF4i sai?
                </button>
            </div>` : ""}`;
    container.appendChild(reviewItem);
  });
  container.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="ask-why-wrong"]');
    if (!btn) return;
    const qid = btn.dataset.questionId;
    if (qid && typeof onAskWhyWrong === "function") {
      onAskWhyWrong(qid, btn);
    }
  });
}

// public/js/pages/result/explain.js
async function askWhyWrong({ state, questionId, btnEl }) {
  const slot = document.getElementById(`explain-slot-${questionId}`);
  if (!slot) return;
  let code = state.accessCode;
  if (!code) {
    const resultCodeRaw = sessionStorage.getItem("easyrevise_result_code");
    if (resultCodeRaw) {
      try {
        const rc = JSON.parse(resultCodeRaw);
        if (rc.examId === state.results.examId) code = rc.code;
      } catch (e) {
      }
    }
  }
  if (!code) {
    const unlockedLS = JSON.parse(localStorage.getItem("easyrevise_unlocked") || "{}");
    code = unlockedLS[state.results.examId] || null;
  }
  if (!code) {
    slot.innerHTML = '<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">\u26A0\uFE0F Kh\xF4ng t\xECm th\u1EA5y m\xE3 k\xEDch ho\u1EA1t \u0111\u1EC3 d\xF9ng t\xEDnh n\u0103ng n\xE0y.</p>';
    return;
  }
  const q = state.questionsList.find((x) => String(x.id) === String(questionId));
  const resultEntry = state.results.results.find((r) => String(r.id) === String(questionId));
  if (!q || !resultEntry) return;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = "\u23F3 \u0110ang h\u1ECFi AI...";
    btnEl.style.opacity = "0.7";
  }
  const userId = state.userId;
  const completedAt = state.results.completedAt || state.results.savedAt || null;
  try {
    const res = await fetch(`/api/exams/${state.results.examId}/explain-wrong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        questionId: String(questionId),
        userAnswer: resultEntry.userAnswer,
        correctAnswer: q.correctAnswer,
        questionText: q.question || "",
        options: q.options || [],
        explanation: q.explanation || "",
        userId,
        completedAt
      })
    });
    const data = await res.json();
    if (!res.ok) {
      slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;background:#fef2f2;padding:0.5rem 0.75rem;border-radius:8px;">\u26A0\uFE0F ${data.error || "L\u1ED7i kh\xF4ng r\xF5"}</p>`;
      return;
    }
    const limitInfo = data.limit === -1 ? "" : ` (c\xF2n ${data.remaining >= 0 ? data.remaining : "\u221E"} l\u1EA7n)`;
    slot.innerHTML = `
            <div style="margin-top:0.75rem;border-radius:14px;overflow:hidden;border:1px solid rgba(99,102,241,0.25);">
                <div style="padding:0.65rem 1rem;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.07));border-bottom:1px solid rgba(99,102,241,0.12);display:flex;align-items:center;gap:0.5rem;">
                    <span>\u{1F916}</span>
                    <span style="font-size:0.75rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;">AI Gi\u1EA3i Th\xEDch${limitInfo}</span>
                </div>
                <div style="padding:0.9rem 1rem;font-size:0.88rem;color:var(--text-main);line-height:1.65;">${renderMarkdown(data.explanation)}</div>
            </div>`;
    if (typeof renderMathInElement === "function") {
      renderMathInElement(slot, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    }
  } catch (err) {
    slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">\u274C ${err.message}</p>`;
  }
}

// public/js/pages/result/index.js
async function bootstrap() {
  const state = new ResultState();
  if (!state.loadSavedResult()) {
    window.location.href = "/";
    return;
  }
  try {
    await state.fetchExamAndFlatten();
    renderSummary(state);
    const container = document.getElementById("reviewContainer");
    renderReviewList({
      state,
      container,
      onAskWhyWrong: (qid, btn) => askWhyWrong({ state, questionId: qid, btnEl: btn })
    });
    const poller = new GradePoller();
    const initial = await poller.loadInitial(state);
    if (initial.grades && initial.grades.length > 0) {
      const { updateGradeCards } = await import("./polling-IMNOIBFE.js");
      updateGradeCards(initial.grades);
    }
    if (initial.pending && state.hasGradeable()) {
      const ctx = initial.pollCtx || {
        examId: state.results.examId,
        code: initial.code || state.accessCode,
        userId: initial.userId || state.userId
      };
      poller.start(ctx);
    }
    if (typeof renderMathInElement === "function") {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    }
  } catch (e) {
    console.error("Result page error:", e);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
//# sourceMappingURL=result.js.map
