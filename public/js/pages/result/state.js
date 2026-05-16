// EasyRevise — Result state and data loading.
// Loads saved final result from sessionStorage, fetches full exam data, flattens questions list.

export class ResultState {
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
        const saved = sessionStorage.getItem('easyrevise_final_result');
        if (!saved) return false;
        this.results = JSON.parse(saved);

        // Resolve access code: prefer sessionStorage (set by app.js after submit),
        // fallback to localStorage (review-by-code or direct revisit).
        let accessCode = null;
        const resultCodeRaw = sessionStorage.getItem('easyrevise_result_code');
        if (resultCodeRaw) {
            try {
                const rc = JSON.parse(resultCodeRaw);
                if (rc.examId === this.results.examId) accessCode = rc.code;
            } catch (e) { /* ignore parse errors */ }
        }
        if (!accessCode) {
            const unlockedLS = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
            accessCode = unlockedLS[this.results.examId] || null;
        }
        this.accessCode = accessCode;

        try {
            this.userId = JSON.parse(localStorage.getItem('easyrevise_user') || '{}').id || null;
        } catch (e) { this.userId = null; }
        return true;
    }

    /**
     * Fetch full exam from API, then flatten sections into questionsList with type flags.
     */
    async fetchExamAndFlatten() {
        const headers = {};
        if (this.accessCode) headers['x-access-code'] = this.accessCode;
        const token = localStorage.getItem('easyrevise_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/exams/${this.results.examId}`, { headers });
        if (!res.ok) throw new Error('Exam not found');
        this.examData = await res.json();

        this.questionsList = [];
        this.examData.sections.forEach(section => {
            if (section.type === 'writing-essay') {
                this.questionsList.push({ ...section, isEssay: true, sectionTitle: section.title });
            } else if (section.type === 'free-form') {
                const freeQuestions = (section.questions && section.questions.length)
                    ? section.questions
                    : (section.subParts && section.subParts.length)
                        ? [{
                            id: section.id,
                            question: section.prompt || section.title || '',
                            subParts: section.subParts,
                            sampleAnswer: section.sampleAnswer || ''
                        }]
                        : [];
                freeQuestions.forEach(q => {
                    this.questionsList.push({
                        ...q,
                        isFreeForm: true,
                        isEssay: false,
                        sectionTitle: section.title,
                        instruction: section.instruction || '',
                        sectionPrompt: section.prompt || '',
                        sectionSampleAnswer: section.sampleAnswer || '',
                        cues: q.cues || section.cues || []
                    });
                });
            } else if (section.type === 'fill-in-blank') {
                (section.questions || []).forEach(q => {
                    this.questionsList.push({
                        ...q,
                        isFillBlank: true,
                        isEssay: false,
                        isFreeForm: false,
                        sectionTitle: section.title
                    });
                });
            } else {
                (section.questions || []).forEach(q => {
                    this.questionsList.push({ ...q, isEssay: false, sectionTitle: section.title });
                });
            }
        });
    }

    hasGradeable() {
        return this.questionsList.some(q => q.isEssay || q.isFreeForm || q.isFillBlank);
    }
}
