// lib/ielts-ai-grader.js — AI-powered band scoring for Writing + Speaking
'use strict';
const { chatCompletion } = require('./ai-client');

const WRITING_RUBRIC = `You are an experienced IELTS examiner. Grade this Writing submission strictly per the official IELTS rubric on a 0–9 band scale, in 0.5 increments.

Score 4 criteria, each 0–9:
- TR (Task Response / Task Achievement): How well the candidate addresses all parts of the task with relevant ideas, fully developed.
- CC (Coherence and Cohesion): Logical organization, clear progression, appropriate use of cohesive devices and paragraphing.
- LR (Lexical Resource): Range of vocabulary, accuracy, naturalness, awareness of style and collocation.
- GRA (Grammatical Range and Accuracy): Range of structures, accuracy, control of complex forms.

Compute Overall as the arithmetic mean of the 4 criteria, rounded to nearest 0.5 (or .25 → up).

Return ONLY valid JSON in this exact shape:
{
  "tr": <number>, "cc": <number>, "lr": <number>, "gra": <number>, "overall": <number>,
  "feedback": {
    "tr": "<2-3 specific sentences>",
    "cc": "<2-3 specific sentences>",
    "lr": "<2-3 specific sentences with example errors/improvements>",
    "gra": "<2-3 specific sentences with example errors/improvements>",
    "overall_comment": "<1-2 sentences summarising the band and main improvement>",
    "suggestions": ["<concrete suggestion 1>", "<concrete suggestion 2>", "<concrete suggestion 3>"]
  }
}`;

const SPEAKING_RUBRIC = `You are an experienced IELTS Speaking examiner. Grade this transcript strictly per the official rubric on a 0–9 band scale, in 0.5 increments.

Score 4 criteria, each 0–9:
- FC (Fluency and Coherence): Speech rate, hesitation, self-correction, logical flow.
- LR (Lexical Resource): Range, accuracy, paraphrasing ability, idiomatic language.
- GRA (Grammatical Range and Accuracy): Variety of structures, accuracy.
- Pron (Pronunciation): Inferred from transcript only — phonological errors, intonation, sentence stress (note: limited without audio).

Compute Overall as the arithmetic mean.

Return ONLY valid JSON:
{
  "fc": <number>, "lr": <number>, "gra": <number>, "pron": <number>, "overall": <number>,
  "feedback": {
    "fc": "<2-3 sentences>",
    "lr": "<2-3 sentences>",
    "gra": "<2-3 sentences>",
    "pron": "<2-3 sentences (cite assumptions due to text-only)>",
    "overall_comment": "<1-2 sentences>",
    "suggestions": ["<...>","<...>","<...>"]
  }
}`;

function parseJsonLoose(text) {
    if (!text) return null;
    let s = text.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
    try { return JSON.parse(s); } catch { return null; }
}

async function gradeWriting({ taskType, prompt, graphImageUrl, essay }) {
    const taskLabel = taskType === 1 ? 'Task 1' : 'Task 2';
    const userMsg = `${taskLabel} prompt:
${prompt}

${graphImageUrl ? `(A chart/diagram is attached.)` : ''}

Candidate's essay (${(essay || '').trim().split(/\s+/).filter(Boolean).length} words):
"""
${essay}
"""

Grade now. Return ONLY the JSON specified.`;

    const messages = [
        { role: 'system', content: WRITING_RUBRIC },
        { role: 'user', content: graphImageUrl
            ? [
                { type: 'text', text: userMsg },
                { type: 'image_url', image_url: { url: graphImageUrl } }
              ]
            : userMsg
        }
    ];

    const text = await chatCompletion({ messages, maxTokens: 2048, temperature: 0.2 });
    const json = parseJsonLoose(text);
    if (!json) throw new Error('AI returned non-JSON: ' + text.slice(0, 300));
    return {
        bandTr: Number(json.tr),
        bandCc: Number(json.cc),
        bandLr: Number(json.lr),
        bandGra: Number(json.gra),
        bandOverall: Number(json.overall),
        feedback: json.feedback
    };
}

async function gradeSpeaking({ partNumber, prompts, transcript }) {
    const promptText = (prompts || []).map((p, i) => `${i + 1}. ${typeof p === 'string' ? p : p.text}`).join('\n');
    const userMsg = `Part ${partNumber} prompts:
${promptText}

Candidate transcript:
"""
${transcript}
"""

Grade now. Return ONLY the JSON specified.`;

    const messages = [
        { role: 'system', content: SPEAKING_RUBRIC },
        { role: 'user', content: userMsg }
    ];

    const text = await chatCompletion({ messages, maxTokens: 2048, temperature: 0.2 });
    const json = parseJsonLoose(text);
    if (!json) throw new Error('AI returned non-JSON: ' + text.slice(0, 300));
    return {
        bandFc: Number(json.fc),
        bandLr: Number(json.lr),
        bandGra: Number(json.gra),
        bandPron: Number(json.pron),
        bandOverall: Number(json.overall),
        feedback: json.feedback
    };
}

module.exports = { gradeWriting, gradeSpeaking };
