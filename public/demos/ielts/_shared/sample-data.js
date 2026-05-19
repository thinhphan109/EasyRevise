/**
 * public/demos/ielts/_shared/sample-data.js
 *
 * One fake reading test consumed by all 3 demo styles. The 6 question
 * types listed below cover the 5 MVP types plus a peek at Diagram
 * Labelling.
 *
 * The shape mirrors the eventual Postgres schema (see
 * implementation_plan.md § 3.3) so demos translate 1:1 to the real
 * runtime later.
 */
window.IELTS_SAMPLE = {
    id: 'demo-test-1',
    skill: 'reading',
    module: 'academic',
    title: 'Demo Reading — The Story of Coffee',
    source: 'Sample (not from any real exam)',
    durationSec: 60 * 60,

    passages: [
        {
            order: 1,
            title: 'Reading Passage 1',
            heading: 'The Story of Coffee',
            body: `
**A.** Coffee was first discovered in Eastern Africa in an area we know today as
Ethiopia. A popular legend refers to a goat herder by the name of Kaldi, who
observed his goats acting unusually friskily after eating berries from a bush.
Curious about this phenomenon, Kaldi tried eating the berries himself. He
found that these berries gave him renewed energy.

**B.** The news of this energy-laden fruit quickly moved throughout the region.
Coffee berries were transported from Ethiopia to the Arabian Peninsula, and
were first cultivated in what today is the country of Yemen. Coffee remained
a secret in Arabia until pilgrims on the Hajj began to bring coffee back to
their homelands.

**C.** Coffee was first marketed as a drug. People believed that coffee was a
cure for almost any illness. By the year 1675, there were more than
3,000 coffee houses in England.

**D.** Coffee plants are evergreen and can grow to heights of about 60 feet,
although in plantations they are cropped to about 10 feet for ease of
picking. Coffee plants produce small white flowers and red, cherry-like
fruit. Inside the fruit are the beans we use to make our drink.

**E.** Today coffee is a giant global industry employing more than 20 million
people. Following crude oil, coffee is the most sought-after commodity in
the world. Each year, coffee growers produce more than 14 billion pounds
of coffee.
            `.trim(),

            questions: [
                // ── 1-3: True / False / Not Given ──
                {
                    id: 'q1',
                    order: 1,
                    type: 'tfng',
                    prompt: 'Coffee was first discovered in Yemen.',
                    correct: 'false'
                },
                {
                    id: 'q2',
                    order: 2,
                    type: 'tfng',
                    prompt: 'Kaldi tasted the berries before his goats did.',
                    correct: 'false'
                },
                {
                    id: 'q3',
                    order: 3,
                    type: 'tfng',
                    prompt: 'Coffee plants on plantations are taller than wild ones.',
                    correct: 'not_given'
                },

                // ── 4-5: Multiple Choice (single) ──
                {
                    id: 'q4',
                    order: 4,
                    type: 'mc_single',
                    prompt: 'How were coffee berries first introduced to the Arabian Peninsula?',
                    payload: {
                        options: [
                            'Through Hajj pilgrims',
                            'By transport from Ethiopia',
                            'By European traders',
                            'They grew there naturally'
                        ]
                    },
                    correct: 1
                },
                {
                    id: 'q5',
                    order: 5,
                    type: 'mc_single',
                    prompt: 'In Paragraph C, coffee was first sold as ___.',
                    payload: {
                        options: ['a beverage', 'a snack', 'a medicine', 'a fertiliser']
                    },
                    correct: 2
                },

                // ── 6-8: Sentence Completion ──
                {
                    id: 'q6',
                    order: 6,
                    type: 'sentence_completion',
                    prompt: 'In plantations, coffee plants are kept at a height of about ___ feet.',
                    payload: { template: '___ feet', maxWords: 1 },
                    correct: '10',
                    alternatives: ['ten']
                },
                {
                    id: 'q7',
                    order: 7,
                    type: 'sentence_completion',
                    prompt: 'After ___, coffee is the most sought-after commodity globally.',
                    payload: { template: 'After ___', maxWords: 2 },
                    correct: 'crude oil'
                },
                {
                    id: 'q8',
                    order: 8,
                    type: 'sentence_completion',
                    prompt: 'The coffee industry employs more than ___ people.',
                    payload: { template: '___ people', maxWords: 3 },
                    correct: '20 million',
                    alternatives: ['twenty million']
                },

                // ── 9-13: Matching Headings ──
                {
                    id: 'q9-13',
                    order: 9,
                    type: 'matching_headings',
                    prompt: 'Match each paragraph A–E with the most appropriate heading i–viii.',
                    payload: {
                        paragraphs: ['A', 'B', 'C', 'D', 'E'],
                        headings: [
                            { key: 'i', text: 'A booming global industry' },
                            { key: 'ii', text: 'How coffee reached the Arab world' },
                            { key: 'iii', text: 'The legend of the dancing goats' },
                            { key: 'iv', text: 'A drink for emperors' },
                            { key: 'v', text: 'Botanical features of the plant' },
                            { key: 'vi', text: 'Coffee in modern medicine' },
                            { key: 'vii', text: 'Marketing coffee as medicine' },
                            { key: 'viii', text: 'The decline of tea in England' }
                        ]
                    },
                    correct: { A: 'iii', B: 'ii', C: 'vii', D: 'v', E: 'i' }
                }
            ]
        }
    ],

    bandTable: {
        // Academic Reading raw → band (subset, 0-13 questions in this demo
        // → scaled out of 13 for the demo only)
        13: 9.0, 12: 8.5, 11: 8.0, 10: 7.5,
        9: 7.0, 8: 6.5, 7: 6.0, 6: 5.5,
        5: 5.0, 4: 4.5, 3: 4.0, 2: 3.5,
        1: 3.0, 0: 0.0
    }
};
