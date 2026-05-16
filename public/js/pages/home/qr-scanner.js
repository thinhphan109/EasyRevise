/* ========================================
   EasyRevise — Home / QR Scanner
   Camera-based QR code scanning
   ======================================== */

let _qrStream = null, _qrAnimFrame = null, _qrDetected = false;

/**
 * Open QR scanner modal and start camera
 */
function openQRScanner() {
    _qrDetected = false;
    document.getElementById('qrScannerModal').classList.add('active');
    document.getElementById('qrScanStatus').textContent = 'Đang khởi động camera...';
    document.getElementById('qrScanStatus').style.color = '#64748b';
    startQRCamera();
}

/**
 * Close QR scanner modal and stop camera
 */
function closeQRScanner() {
    document.getElementById('qrScannerModal').classList.remove('active');
    stopQRCamera();
}

/**
 * Start camera stream for QR scanning
 */
async function startQRCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }
        });
        _qrStream = stream;
        const video = document.getElementById('qrVideo');
        video.srcObject = stream;
        await video.play();
        document.getElementById('qrScanStatus').textContent = 'Đang quét... Hướng mã QR vào khung hình';
        _qrDetected = false;
        scanQRFrame();
    } catch (err) {
        let msg = '❌ Không thể truy cập camera.';
        if (err.name === 'NotAllowedError') msg = '❌ Bạn cần cấp quyền camera trong trình duyệt.';
        else if (err.name === 'NotFoundError') msg = '❌ Không tìm thấy camera trên thiết bị này.';
        document.getElementById('qrScanStatus').textContent = msg;
        document.getElementById('qrScanStatus').style.color = '#dc2626';
    }
}

/**
 * Stop camera stream
 */
function stopQRCamera() {
    if (_qrAnimFrame) { cancelAnimationFrame(_qrAnimFrame); _qrAnimFrame = null; }
    if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
    const video = document.getElementById('qrVideo');
    if (video) video.srcObject = null;
}

/**
 * Scan one frame for QR code
 */
function scanQRFrame() {
    if (_qrDetected) return;
    const video = document.getElementById('qrVideo');
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        _qrAnimFrame = requestAnimationFrame(scanQRFrame);
        return;
    }
    const canvas = document.getElementById('qrCanvas2');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
        const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (result && result.data) { onQRDetected(result.data); return; }
    }
    _qrAnimFrame = requestAnimationFrame(scanQRFrame);
}

/**
 * Handle detected QR code
 * @param {string} rawData
 */
function onQRDetected(rawData) {
    _qrDetected = true;
    stopQRCamera();
    let code = null, examId = null;
    try {
        const url = new URL(rawData);
        code = url.searchParams.get('code');
        examId = url.searchParams.get('examId');
    } catch (e) { /* not a URL */ }

    if (code && examId) {
        document.getElementById('qrScanStatus').textContent = '✅ Đã nhận mã! Đang tải thông tin...';
        document.getElementById('qrScanStatus').style.color = '#16a34a';
        setTimeout(() => {
            closeQRScanner();
            showQREntryPopup(code.toUpperCase().trim(), examId);
        }, 500);
    } else {
        document.getElementById('qrScanStatus').innerHTML =
            '<span style="color:#f59e0b;">⚠️ QR không phải đề EasyRevise.</span><br><small class="text-muted">' + rawData.slice(0, 80) + '</small>';
        setTimeout(() => { _qrDetected = false; startQRCamera(); }, 3000);
    }
}

// Bind close events when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('qrScanCloseBtn')?.addEventListener('click', closeQRScanner);
    document.getElementById('qrScannerModal')?.addEventListener('click', function (e) {
        if (e.target === this) closeQRScanner();
    });
});
