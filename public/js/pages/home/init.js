/* ========================================
   EasyRevise — Home / Init
   Initializes the home page
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Restore user & update UI
    updateAuthUI();

    // Load exams & in-progress
    loadExams();
    loadInProgress();

    // Load history (server if logged in, local otherwise)
    if (currentUser) {
        loadHistory();
    } else {
        loadLocalHistory();
    }

    // Bind keyboard shortcuts for modals
    document.getElementById('codeInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitCode();
    });
    document.getElementById('pinInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitPin();
    });
    document.getElementById('reviewCodeInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitReviewCode();
    });
});
