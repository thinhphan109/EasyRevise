// EasyRevise — Media renderers for images and videos in result page.

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

// Reusable inline-image expand pattern. Returns HTML string for hero image with click-to-zoom.
export function buildHeroImageHtml(src, maxHeight = 350) {
    return `<div style="margin:0.75rem 0;"><img src="${src}" alt="" style="max-width:100%;max-height:${maxHeight}px;border-radius:12px;cursor:zoom-in;object-fit:contain;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:100%;max-height:${maxHeight}px;border-radius:12px;cursor:zoom-in;object-fit:contain';}"></div>`;
}

export function buildThumbnailGridHtml(srcs, maxW = 200, maxH = 160, alt = 'Hình') {
    let html = `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">`;
    srcs.forEach((src, i) => {
        html += `<img src="${src}" alt="${alt} ${i + 1}" style="max-width:${maxW}px;max-height:${maxH}px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
    });
    html += `</div>`;
    return html;
}

// Builds HTML to display question or explanation media (images + video) in standard layout.
export function buildMediaHtml(item, opts = {}) {
    const isExpl = !!opts.explanation;
    const imageField = isExpl ? 'explanationImages' : 'images';
    const legacyField = isExpl ? 'explanationImage' : 'image';
    const videoField = isExpl ? 'explanationVideo' : 'video';
    const maxHeight = isExpl ? 400 : 350;
    const altPrefix = isExpl ? 'Ảnh giải đáp' : 'Hình';

    const imgs = [];
    if (item[imageField] && item[imageField].length > 0) imgs.push(...item[imageField]);
    else if (item[legacyField]) imgs.push(item[legacyField]);
    if (!isExpl && item.imageUrl && !imgs.includes(item.imageUrl)) imgs.push(item.imageUrl);

    let html = '';
    if (imgs.length === 1) html += buildHeroImageHtml(imgs[0], maxHeight);
    else if (imgs.length > 1) html += buildThumbnailGridHtml(imgs, isExpl ? 220 : 200, isExpl ? 180 : 160, altPrefix);
    if (item[videoField]) html += buildVideoHtml(item[videoField]);
    return html;
}
