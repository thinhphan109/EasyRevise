// EasyRevise — Markdown renderer
// Supports: tables, headings (h2/h3), bold, italic, inline code, inline images.
// Returns HTML string. NOTE: caller must trust input or escape user content first.

function inlineFmt(str) {
    return str
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
            `<img src="${url}" alt="${alt}" style="max-width:100%;max-height:380px;border-radius:10px;display:block;margin:0.5rem auto;cursor:zoom-in;object-fit:contain;" onclick="window.open('${url}','_blank')">`)
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>');
}

export function renderMarkdown(text) {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Markdown table: line starts with | AND next line is separator |---|...
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|([-:\s]+\|)+$/.test(lines[i + 1].trim())) {
            const headers = trimmed.split('|').slice(1, -1).map(c => c.trim());
            let t = `<div style="overflow-x:auto;margin:0.65rem 0;"><table style="border-collapse:collapse;width:100%;font-size:0.88rem;">`;
            t += `<thead><tr>` + headers.map(c =>
                `<th style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;background:rgba(99,102,241,0.09);font-weight:700;text-align:center;">${inlineFmt(c)}</th>`
            ).join('') + `</tr></thead><tbody>`;
            i += 2; // skip header + separator row
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                const cells = lines[i].trim().split('|').slice(1, -1).map(c => c.trim());
                t += `<tr>` + cells.map(c =>
                    `<td style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;text-align:center;">${inlineFmt(c)}</td>`
                ).join('') + `</tr>`;
                i++;
            }
            t += `</tbody></table></div>`;
            html += t;
            continue;
        }

        if (trimmed.startsWith('### ')) {
            html += `<div style="font-weight:700;font-size:0.97rem;margin:0.6rem 0 0.2rem;">${inlineFmt(trimmed.slice(4))}</div>`;
        } else if (trimmed.startsWith('## ')) {
            html += `<div style="font-weight:800;font-size:1.05rem;margin:0.75rem 0 0.25rem;">${inlineFmt(trimmed.slice(3))}</div>`;
        } else if (trimmed === '') {
            html += '<div style="height:0.45rem;"></div>';
        } else {
            html += `<div style="line-height:1.8;">${inlineFmt(trimmed)}</div>`;
        }
        i++;
    }
    return html;
}
