// public/js/pages/dashboard/index.js
document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("easyrevise_token");
  if (!token) {
    document.getElementById("dashboardLoading").hidden = true;
    document.getElementById("dashboardLoginRequired").hidden = false;
    return;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1e4);
    const res = await fetch("/api/dashboard", {
      headers: { "Authorization": `Bearer ${token}` },
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    if (res.status === 401 || res.status === 403) {
      document.getElementById("dashboardLoading").hidden = true;
      document.getElementById("dashboardLoginRequired").hidden = false;
      return;
    }
    if (!res.ok) throw new Error("Load failed");
    const data = await res.json();
    document.getElementById("dashboardLoading").hidden = true;
    document.getElementById("dashboardContent").hidden = false;
    renderProfile(data.user, data.stats);
    renderStats(data.stats);
    renderSubjects(data.subjectBreakdown, data.stats.totalAttempts);
    renderHistory(data.recentHistory);
  } catch (err) {
    const isTimeout = err.name === "AbortError";
    console.error("Dashboard load error:", err);
    document.getElementById("dashboardLoading").innerHTML = `
            <div class="dash-section" style="text-align:center;padding:var(--space-10) 0;">
                <div style="font-size:48px;margin-bottom:var(--space-3);">${isTimeout ? "\u23F1\uFE0F" : "\u26A0\uFE0F"}</div>
                <p style="color:var(--text-2);margin-bottom:var(--space-4);">
                    ${isTimeout ? "Y\xEAu c\u1EA7u m\u1EA5t qu\xE1 l\xE2u. M\xE1y ch\u1EE7 c\xF3 th\u1EC3 \u0111ang b\u1EADn." : "Kh\xF4ng th\u1EC3 t\u1EA3i d\u1EEF li\u1EC7u. Vui l\xF2ng th\u1EED l\u1EA1i."}
                </p>
                <button class="btn btn-primary" onclick="location.reload()">T\u1EA3i l\u1EA1i</button>
                <a href="/" class="btn btn-ghost" style="margin-left:var(--space-2);">V\u1EC1 trang ch\u1EE7</a>
            </div>`;
  }
});
function renderProfile(user, stats) {
  const avatarEl = document.getElementById("profileAvatar");
  const avatarName = user.username || user.displayName || "anonymous";
  avatarEl.src = `/api/avatar?name=${encodeURIComponent(avatarName)}&size=64`;
  avatarEl.alt = user.displayName || "Avatar";
  document.getElementById("profileName").textContent = user.displayName;
  const joinDate = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString("vi-VN") : "";
  document.getElementById("profileMeta").textContent = joinDate ? `Th\xE0nh vi\xEAn t\u1EEB ${joinDate}` : "H\u1ECDc vi\xEAn";
  if (stats.streakDays > 0) {
    document.getElementById("streakBadge").hidden = false;
    document.getElementById("streakCount").textContent = stats.streakDays;
  }
}
function renderStats(stats) {
  const cards = [
    {
      icon: "\u{1F4DD}",
      label: "\u0110\u1EC1 \u0111\xE3 l\xE0m",
      value: stats.totalExams,
      suffix: "",
      color: "primary",
      iconClass: "stat-icon--primary"
    },
    {
      icon: "\u2B50",
      label: "\u0110i\u1EC3m TB",
      value: stats.avgScore,
      suffix: "",
      color: "success",
      iconClass: "stat-icon--success",
      decimal: true
    },
    {
      icon: "\u{1F3AF}",
      label: "Ch\xEDnh x\xE1c",
      value: stats.accuracy,
      suffix: "%",
      color: "warning",
      iconClass: "stat-icon--warning"
    },
    {
      icon: "\u23F1\uFE0F",
      label: "Th\u1EDDi gian",
      value: stats.timeSpentMinutes,
      suffix: "p",
      color: "accent",
      iconClass: "stat-icon--accent",
      format: formatTimeCard
    }
  ];
  const grid = document.getElementById("statGrid");
  grid.innerHTML = cards.map((c, i) => {
    const valClass = c.color !== "primary" ? ` stat-value--${c.color}` : "";
    const displayVal = c.format ? c.format(c.value) : c.value;
    return `
            <div class="stat-card" style="animation-delay: ${i * 60}ms;">
                <div class="stat-icon ${c.iconClass}">${c.icon}</div>
                <div class="stat-value${valClass}" data-target="${c.value}" data-suffix="${c.suffix}" data-decimal="${c.decimal || false}">
                    ${displayVal}${c.suffix}
                </div>
                <div class="stat-label">${c.label}</div>
            </div>`;
  }).join("");
  grid.querySelectorAll(".stat-value[data-target]").forEach((el) => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const isDecimal = el.dataset.decimal === "true";
    if (target === 0) return;
    animateValue(el, target, suffix, isDecimal);
  });
}
function animateValue(el, target, suffix, decimal) {
  const duration = 1200;
  const start = performance.now();
  const format = decimal ? 1 : 0;
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;
    el.textContent = current.toFixed(format) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function formatTimeCard(minutes) {
  if (minutes < 60) return minutes;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? m : ""}`;
}
function renderSubjects(subjects, totalAttempts) {
  if (!subjects || subjects.length === 0) return;
  const section = document.getElementById("subjectSection");
  section.hidden = false;
  const colors = ["", "--accent", "--success", "--warning", "--info"];
  const maxAttempts = Math.max(...subjects.map((s) => s.attempts));
  const list = document.getElementById("subjectList");
  list.innerHTML = subjects.map((s, i) => {
    const fillPct = Math.round(s.attempts / maxAttempts * 100);
    const colorClass = colors[i % colors.length];
    return `
            <div class="subject-bar">
                <div class="subject-name">${escapeHtml(s.subject)}</div>
                <div class="subject-bar-track">
                    <div class="subject-bar-fill${colorClass ? " subject-bar-fill" + colorClass : ""}"
                         style="width: 0%;" data-fill="${fillPct}"></div>
                </div>
                <div class="subject-stats">${s.attempts} b\xE0i \xB7 ${s.avgScore}</div>
            </div>`;
  }).join("");
  requestAnimationFrame(() => {
    list.querySelectorAll(".subject-bar-fill").forEach((bar) => {
      const fill = bar.dataset.fill;
      setTimeout(() => {
        bar.style.width = fill + "%";
      }, 100);
    });
  });
}
function renderHistory(history) {
  if (!history || history.length === 0) {
    document.getElementById("emptyState").hidden = false;
    return;
  }
  const section = document.getElementById("historySection");
  section.hidden = false;
  const list = document.getElementById("historyList");
  list.innerHTML = history.map((h, idx) => {
    const score = parseFloat(h.score) || 0;
    const scoreClass = score >= 8 ? "high" : score >= 5 ? "mid" : "low";
    const timeAgo = formatTimeAgo(h.completedAt);
    const timeStr = formatDuration(h.timeSpent);
    const completedAtAttr = h.completedAt ? encodeURIComponent(h.completedAt) : "";
    return `
            <div class="history-item history-item--row" data-idx="${idx}">
                <a class="history-item-link" href="result.html?examId=${h.examId}">
                    <div class="history-item-info">
                        <div class="history-item-title">${escapeHtml(h.examTitle)}</div>
                        <div class="history-item-meta">
                            ${h.subject ? escapeHtml(h.subject) + " \xB7 " : ""}${h.correct}/${h.total} c\xE2u \u0111\xFAng \xB7 ${timeStr}
                        </div>
                    </div>
                    <div class="history-score history-score--${scoreClass}">${score.toFixed(1)}/10</div>
                    <div class="history-time">${timeAgo}</div>
                </a>
                <button class="history-item-delete" data-examid="${escapeHtml(h.examId)}" data-completedat="${completedAtAttr}" title="X\xF3a l\u1ECBch s\u1EED" aria-label="X\xF3a l\u1ECBch s\u1EED n\xE0y">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
            </div>`;
  }).join("");
  list.querySelectorAll(".history-item-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("X\xF3a l\u1ECBch s\u1EED l\xE0m b\xE0i n\xE0y?")) return;
      const examId = btn.dataset.examid;
      const completedAt = decodeURIComponent(btn.dataset.completedat || "");
      const token = localStorage.getItem("easyrevise_token");
      if (!token) return alert("B\u1EA1n c\u1EA7n \u0111\u0103ng nh\u1EADp");
      try {
        const url = `/api/history/${encodeURIComponent(examId)}${completedAt ? "?completedAt=" + encodeURIComponent(completedAt) : ""}`;
        const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "L\u1ED7i x\xF3a");
        btn.closest(".history-item").remove();
        if (!list.children.length) section.hidden = true;
      } catch (err) {
        alert("\u274C " + err.message);
      }
    });
  });
}
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "V\u1EEBa xong";
  if (mins < 60) return `${mins} ph\xFAt tr\u01B0\u1EDBc`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} gi\u1EDD tr\u01B0\u1EDBc`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ng\xE0y tr\u01B0\u1EDBc`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}
function formatDuration(seconds) {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}p`;
}
//# sourceMappingURL=dashboard.js.map
