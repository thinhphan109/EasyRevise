// EasyRevise — Question media renderer (images + video).
// Pure DOM helper, no class state.

/**
 * Build YouTube/Drive/MP4 iframe or video element HTML for a video URL.
 */
export function buildVideoHtml(url) {
    if (!url) return '';
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

const ZOOM_TOGGLE_HTML = `this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:%MW%;max-height:%MH%;border-radius:%R%;cursor:zoom-in;object-fit:%FIT%;%EXTRA%';}`;

/**
 * Render question media (images + video) into either visible container or hint container.
 * imgContainer/hintContainer must exist in DOM.
 */
export function renderQuestionMedia(question, { imgContainer, hintContainer }) {
    if (!imgContainer || !hintContainer) return;

    imgContainer.innerHTML = ''; imgContainer.style.display = 'none';
    hintContainer.innerHTML = ''; hintContainer.style.display = 'none';

    const allImages = [];
    if (question.images && question.images.length > 0) allImages.push(...question.images);
    else if (question.image) allImages.push(question.image);
    if (question.imageUrl && !allImages.includes(question.imageUrl)) allImages.push(question.imageUrl);

    const hasVideo = !!question.video;
    if (!allImages.length && !hasVideo) return;

    let mediaHtml = '';

    if (allImages.length === 1) {
        const restoreStyle = ZOOM_TOGGLE_HTML
            .replace('%MW%', '350px')
            .replace('%MH%', 'unset')
            .replace('%R%', '12px')
            .replace('%FIT%', 'contain')
            .replace('%EXTRA%', 'width:100%');
        mediaHtml += `<img src="${allImages[0]}" alt="" style="max-width:350px;width:100%;border-radius:12px;cursor:zoom-in;" onclick="${restoreStyle}">`;
    } else if (allImages.length > 1) {
        mediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">`;
        allImages.forEach((src, i) => {
            const restoreStyle = ZOOM_TOGGLE_HTML
                .replace('%MW%', '200px')
                .replace('%MH%', '180px')
                .replace('%R%', '10px')
                .replace('%FIT%', 'cover')
                .replace('%EXTRA%', 'border:1px solid #e2e8f0');
            mediaHtml += `<img src="${src}" alt="Hình ${i + 1}" style="max-width:200px;max-height:180px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="${restoreStyle}">`;
        });
        mediaHtml += `</div>`;
    }

    if (hasVideo) mediaHtml += buildVideoHtml(question.video);

    if (question.mediaAsHint) {
        hintContainer.style.display = 'block';
        hintContainer.innerHTML = `
            <button class="btn btn-sm" data-action="reveal-hint"
                style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:0.4rem 1rem;border-radius:8px;cursor:pointer;font-size:0.85rem;">
                💡 Xem gợi ý
            </button>
            <div data-hint-content style="display:none;margin-top:0.5rem;">${mediaHtml}</div>`;
        const btn = hintContainer.querySelector('[data-action="reveal-hint"]');
        const content = hintContainer.querySelector('[data-hint-content]');
        if (btn && content) {
            btn.addEventListener('click', () => {
                content.style.display = 'block';
                btn.style.display = 'none';
            });
        }
    } else {
        imgContainer.style.display = 'block';
        imgContainer.innerHTML = mediaHtml;
    }
}
