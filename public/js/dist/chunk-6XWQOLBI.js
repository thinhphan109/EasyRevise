// public/js/pages/shared/markdown.js
function inlineFmt(str) {
  return str.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img src="${url}" alt="${alt}" style="max-width:100%;max-height:380px;border-radius:10px;display:block;margin:0.5rem auto;cursor:zoom-in;object-fit:contain;" onclick="window.open('${url}','_blank')">`).replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>');
}
function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|([-:\s]+\|)+$/.test(lines[i + 1].trim())) {
      const headers = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      let t = `<div style="overflow-x:auto;margin:0.65rem 0;"><table style="border-collapse:collapse;width:100%;font-size:0.88rem;">`;
      t += `<thead><tr>` + headers.map(
        (c) => `<th style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;background:rgba(99,102,241,0.09);font-weight:700;text-align:center;">${inlineFmt(c)}</th>`
      ).join("") + `</tr></thead><tbody>`;
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().split("|").slice(1, -1).map((c) => c.trim());
        t += `<tr>` + cells.map(
          (c) => `<td style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;text-align:center;">${inlineFmt(c)}</td>`
        ).join("") + `</tr>`;
        i++;
      }
      t += `</tbody></table></div>`;
      html += t;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      html += `<div style="font-weight:700;font-size:0.97rem;margin:0.6rem 0 0.2rem;">${inlineFmt(trimmed.slice(4))}</div>`;
    } else if (trimmed.startsWith("## ")) {
      html += `<div style="font-weight:800;font-size:1.05rem;margin:0.75rem 0 0.25rem;">${inlineFmt(trimmed.slice(3))}</div>`;
    } else if (trimmed === "") {
      html += '<div style="height:0.45rem;"></div>';
    } else {
      html += `<div style="line-height:1.8;">${inlineFmt(trimmed)}</div>`;
    }
    i++;
  }
  return html;
}

// public/js/pages/shared/escape.js
function escapeHtml(str) {
  if (str === null || str === void 0) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// public/js/pages/result/polling.js
var GradePoller = class {
  constructor() {
    this._pollTimer = null;
    this._timerTick = null;
  }
  /**
   * Initial load of any existing grades. Returns { grades, pending, hasGradeable }.
   */
  async loadInitial(state) {
    const pollCtxRaw = sessionStorage.getItem("easyrevise_grade_poll");
    let pollCtx = null;
    try {
      pollCtx = pollCtxRaw ? JSON.parse(pollCtxRaw) : null;
    } catch (e) {
      pollCtx = null;
    }
    const code = state.accessCode || pollCtx?.code || null;
    const userId = pollCtx?.userId || state.userId || null;
    if (!state.hasGradeable()) return { grades: [], pending: false, pollCtx };
    try {
      const params = new URLSearchParams();
      if (code) params.set("code", code);
      if (userId) params.set("userId", userId);
      const gr = await fetch(`/api/exams/${state.results.examId}/my-grades?${params}`);
      if (!gr.ok) return { grades: [], pending: false, pollCtx };
      const data = await gr.json();
      return { grades: data.grades || [], pending: !!data.pending, pollCtx, code, userId };
    } catch (e) {
      return { grades: [], pending: false, pollCtx, code, userId };
    }
  }
  /**
   * Start polling loop. Call after loadInitial reports pending=true.
   */
  start({ examId, code, userId }) {
    const banner = document.getElementById("aiGradingBanner");
    const timerEl = document.getElementById("aiGradingTimer");
    const subtextEl = document.getElementById("aiGradingSubtext");
    if (banner) banner.style.display = "block";
    const startedAt = Date.now();
    const MAX_WAIT_MS = 3 * 60 * 1e3;
    const POLL_INTERVAL = 4e3;
    const updateTimer = () => {
      const elapsed = Math.round((Date.now() - startedAt) / 1e3);
      if (timerEl) timerEl.textContent = `${elapsed}s`;
    };
    const finish = (state) => {
      clearInterval(this._pollTimer);
      clearInterval(this._timerTick);
      sessionStorage.removeItem("easyrevise_grade_poll");
      if (!banner) return;
      if (state === "graded") {
        banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.5rem;
                        background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:16px;" class="ai-grade-done-banner">
                        <span style="font-size:1.3rem;">\u2705</span>
                        <div style="font-weight:700;color:#16a34a;">Ch\u1EA5m xong! \u0110i\u1EC3m \u0111\xE3 \u0111\u01B0\u1EE3c c\u1EADp nh\u1EADt b\xEAn d\u01B0\u1EDBi.</div>
                    </div>`;
        setTimeout(() => {
          banner.style.opacity = "0";
          banner.style.transition = "opacity 0.6s";
          setTimeout(() => banner.remove(), 700);
        }, 4e3);
      } else if (state === "resolved") {
        banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.5rem;
                        background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:16px;">
                        <span style="font-size:1.3rem;">\u2139\uFE0F</span>
                        <div style="font-weight:700;color:#2563eb;">\u0110\xE3 c\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i ch\u1EA5m b\xE0i b\xEAn d\u01B0\u1EDBi.</div>
                    </div>`;
        setTimeout(() => {
          banner.style.opacity = "0";
          banner.style.transition = "opacity 0.6s";
          setTimeout(() => banner.remove(), 700);
        }, 4e3);
      } else {
        if (subtextEl) subtextEl.innerHTML = "\u0110ang ch\u1EADm h\u01A1n th\u01B0\u1EDDng l\u1EC7. \u0110i\u1EC3m s\u1EBD \u0111\u01B0\u1EE3c c\u1EADp nh\u1EADt sau khi gi\xE1o vi\xEAn xem x\xE9t.";
        if (timerEl) timerEl.textContent = "";
        const spinner = document.getElementById("aiGradingSpinner");
        if (spinner) spinner.style.animationPlayState = "paused";
      }
    };
    const poll = async () => {
      updateTimer();
      try {
        const params = new URLSearchParams();
        if (code) params.set("code", code);
        if (userId) params.set("userId", userId);
        const res = await fetch(`/api/exams/${examId}/my-grades?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.grades && data.grades.length > 0) {
          updateGradeCards(data.grades);
        }
        if (!data.pending) {
          const hasGraded = (data.grades || []).some((g) => g.status === "graded" || g.aiScore !== null && g.aiScore !== void 0 || g.teacherScore !== null && g.teacherScore !== void 0);
          finish(hasGraded ? "graded" : "resolved");
        } else if (Date.now() - startedAt > MAX_WAIT_MS) {
          finish("timeout");
        }
      } catch (e) {
      }
    };
    this._timerTick = setInterval(updateTimer, 1e3);
    this._pollTimer = setInterval(poll, POLL_INTERVAL);
    setTimeout(poll, 2e3);
  }
};
function updateGradeCards(grades) {
  for (const grade of grades) {
    const slot = document.getElementById(`grade-slot-${grade.questionId}`);
    if (!slot) continue;
    const status = grade.status || (grade.aiScore !== null && grade.aiScore !== void 0 ? "graded" : "pending");
    if (status === "skipped" || status === "error" || status === "pending") {
      const palette = status === "error" ? { icon: "\u26A0\uFE0F", title: "AI ch\u1EA5m b\xE0i b\u1ECB l\u1ED7i", color: "#dc2626", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: grade.aiError || "C\xF3 l\u1ED7i khi g\u1ECDi AI ch\u1EA5m b\xE0i." } : status === "skipped" ? { icon: "\u2139\uFE0F", title: "Ch\u01B0a ch\u1EA5m b\u1EB1ng AI", color: "#d97706", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: grade.aiError === "NO_API_KEY" ? "Server ch\u01B0a c\u1EA5u h\xECnh API key ch\u1EA5m AI. B\xE0i \u0111\xE3 \u0111\u01B0\u1EE3c l\u01B0u \u0111\u1EC3 gi\xE1o vi\xEAn xem/ch\u1EA5m sau." : grade.aiError || "AI grading \u0111\xE3 \u0111\u01B0\u1EE3c b\u1ECF qua." } : { icon: "\u23F3", title: "\u0110ang ch\u1EDD ch\u1EA5m AI", color: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.22)", text: "B\xE0i t\u1EF1 lu\u1EADn \u0111\xE3 \u0111\u01B0\u1EE3c l\u01B0u. \u0110i\u1EC3m s\u1EBD c\u1EADp nh\u1EADt khi AI ho\u1EB7c gi\xE1o vi\xEAn ch\u1EA5m xong." };
      slot.innerHTML = `
                <div style="margin-top:1rem;padding:0.9rem 1.1rem;border-radius:14px;border:1px solid ${palette.border};background:${palette.bg};">
                    <div style="display:flex;align-items:center;gap:0.55rem;font-weight:800;color:${palette.color};font-size:0.9rem;">
                        <span>${palette.icon}</span><span>${palette.title}</span>
                    </div>
                    <div style="margin-top:0.45rem;color:var(--text-secondary,#64748b);font-size:0.84rem;line-height:1.55;">${escapeHtml(palette.text)}</div>
                </div>`;
      continue;
    }
    if (grade.aiScore === null || grade.aiScore === void 0) continue;
    const maxScore = grade.aiMaxScore || 10;
    const displayScore = grade.teacherScore !== null && grade.teacherScore !== void 0 ? grade.teacherScore : grade.aiScore;
    const pct = Math.round(displayScore / maxScore * 100);
    const scoreColor = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
    const isTeacherOverride = grade.teacherScore !== null && grade.teacherScore !== void 0;
    slot.innerHTML = `
            <div style="margin-top:1rem;border-radius:14px;overflow:hidden;
                border:1px solid ${isTeacherOverride ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.2)"};
                background:var(--bg-card,#18181b);">

                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;
                    background:${isTeacherOverride ? "rgba(34,197,94,0.07)" : "rgba(99,102,241,0.07)"};
                    border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="font-size:1rem;">${isTeacherOverride ? "\u{1F469}\u200D\u{1F3EB}" : "\u{1F916}"}</span>
                        <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                            ${isTeacherOverride ? "Gi\xE1o vi\xEAn ch\u1EA5m \u0111i\u1EC3m" : "K\u1EBFt qu\u1EA3 ch\u1EA5m"}
                        </span>
                    </div>
                    <div style="display:flex;align-items:baseline;gap:0.3rem;">
                        <span style="font-size:1.6rem;font-weight:900;color:${scoreColor};">${displayScore}</span>
                        <span style="font-size:0.85rem;color:var(--text-muted);">/&thinsp;${maxScore}</span>
                        ${isTeacherOverride && grade.aiScore !== null ? `
                        <span style="margin-left:0.4rem;font-size:0.72rem;color:var(--text-muted);
                            text-decoration:line-through;opacity:0.6;">(AI: ${grade.aiScore})</span>` : ""}
                    </div>
                </div>

                ${grade.aiFeedback || grade.aiBreakdown ? `
                <div style="padding:0.9rem 1.25rem;border-bottom:${grade.teacherFeedback ? "1px solid rgba(255,255,255,0.06)" : "none"};">
                    <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">\u{1F916} Nh\u1EADn x\xE9t</div>
                    ${grade.aiFeedback ? `
                    <div style="font-size:0.88rem;color:var(--text-secondary,#cbd5e1);line-height:1.6;">${renderMarkdown(grade.aiFeedback)}</div>` : ""}
                    ${grade.aiBreakdown ? `
                    <div style="margin-top:0.5rem;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.03);
                        border-radius:8px;font-size:0.8rem;color:var(--text-muted);
                        font-family:inherit;line-height:1.55;">${renderMarkdown(grade.aiBreakdown)}</div>` : ""}
                </div>` : ""}

                ${grade.teacherFeedback ? `
                <div style="padding:0.9rem 1.25rem;">
                    <div style="font-size:0.72rem;font-weight:700;color:#16a34a;
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">\u{1F469}\u200D\u{1F3EB} Nh\u1EADn x\xE9t c\u1EE7a gi\xE1o vi\xEAn</div>
                    <div style="font-size:0.88rem;color:var(--text-main);line-height:1.6;">${renderMarkdown(grade.teacherFeedback)}</div>
                </div>` : ""}
            </div>`;
  }
}

export {
  renderMarkdown,
  escapeHtml,
  GradePoller,
  updateGradeCards
};
//# sourceMappingURL=chunk-6XWQOLBI.js.map
