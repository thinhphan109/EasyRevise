-- migrations/110_seed_ielts_demo.sql
-- Seed the Coffee demo test from public/demos/ielts/_shared/sample-data.js as
-- a real published IELTS Reading test. Idempotent — uses fixed UUIDs and
-- ON CONFLICT clauses.

-- ── Test header ─────────────────────────────────────────────────
INSERT INTO ielts_tests (id, skill, module, title, description, source,
                         duration_sec, is_published)
VALUES (
    '11111111-1111-1111-1111-111111111101'::uuid,
    'reading', 'academic',
    'Demo Reading — The Story of Coffee',
    'Demo test seeded from the hybrid layout sample.',
    'Sample (not from any real exam)',
    3600, true
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    source = EXCLUDED.source,
    duration_sec = EXCLUDED.duration_sec,
    is_published = EXCLUDED.is_published,
    updated_at = now();

-- ── Passage ─────────────────────────────────────────────────────
INSERT INTO ielts_passages (id, test_id, "order", title, body)
VALUES (
    '11111111-1111-1111-1111-111111111102'::uuid,
    '11111111-1111-1111-1111-111111111101'::uuid,
    1, 'The Story of Coffee',
    E'**A.** Coffee was first discovered in Eastern Africa in an area we know today as Ethiopia. A popular legend refers to a goat herder by the name of Kaldi, who observed his goats acting unusually friskily after eating berries from a bush. Curious about this phenomenon, Kaldi tried eating the berries himself. He found that these berries gave him renewed energy.\n\n**B.** The news of this energy-laden fruit quickly moved throughout the region. Coffee berries were transported from Ethiopia to the Arabian Peninsula, and were first cultivated in what today is the country of Yemen. Coffee remained a secret in Arabia until pilgrims on the Hajj began to bring coffee back to their homelands.\n\n**C.** Coffee was first marketed as a drug. People believed that coffee was a cure for almost any illness. By the year 1675, there were more than 3,000 coffee houses in England.\n\n**D.** Coffee plants are evergreen and can grow to heights of about 60 feet, although in plantations they are cropped to about 10 feet for ease of picking. Coffee plants produce small white flowers and red, cherry-like fruit. Inside the fruit are the beans we use to make our drink.\n\n**E.** Today coffee is a giant global industry employing more than 20 million people. Following crude oil, coffee is the most sought-after commodity in the world. Each year, coffee growers produce more than 14 billion pounds of coffee.'
)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    body  = EXCLUDED.body;

-- ── Questions ───────────────────────────────────────────────────
-- Wipe existing seeded questions for this passage so order tweaks re-apply
DELETE FROM ielts_questions
 WHERE passage_id = '11111111-1111-1111-1111-111111111102'::uuid
   AND id IN (
        '11111111-1111-1111-1111-111111111201'::uuid,
        '11111111-1111-1111-1111-111111111202'::uuid,
        '11111111-1111-1111-1111-111111111203'::uuid,
        '11111111-1111-1111-1111-111111111204'::uuid,
        '11111111-1111-1111-1111-111111111205'::uuid,
        '11111111-1111-1111-1111-111111111206'::uuid,
        '11111111-1111-1111-1111-111111111207'::uuid,
        '11111111-1111-1111-1111-111111111208'::uuid,
        '11111111-1111-1111-1111-111111111209'::uuid
   );

INSERT INTO ielts_questions
    (id, passage_id, "order", type, prompt, payload, correct, alternatives) VALUES

-- 1-3 TFNG
('11111111-1111-1111-1111-111111111201'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 1, 'tfng', 'Coffee was first discovered in Yemen.',
 '{}'::jsonb, '"false"'::jsonb, '[]'::jsonb),

('11111111-1111-1111-1111-111111111202'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 2, 'tfng', 'Kaldi tasted the berries before his goats did.',
 '{}'::jsonb, '"false"'::jsonb, '[]'::jsonb),

('11111111-1111-1111-1111-111111111203'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 3, 'tfng', 'Coffee plants on plantations are taller than wild ones.',
 '{}'::jsonb, '"not_given"'::jsonb, '[]'::jsonb),

-- 4-5 MC single
('11111111-1111-1111-1111-111111111204'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 4, 'mc_single', 'How were coffee berries first introduced to the Arabian Peninsula?',
 '{"options":["Through Hajj pilgrims","By transport from Ethiopia","By European traders","They grew there naturally"]}'::jsonb,
 '1'::jsonb, '[]'::jsonb),

('11111111-1111-1111-1111-111111111205'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 5, 'mc_single', 'In Paragraph C, coffee was first sold as ___.',
 '{"options":["a beverage","a snack","a medicine","a fertiliser"]}'::jsonb,
 '2'::jsonb, '[]'::jsonb),

-- 6-8 Sentence completion
('11111111-1111-1111-1111-111111111206'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 6, 'sentence_completion', 'In plantations, coffee plants are kept at a height of about ___ feet.',
 '{"template":"___ feet","maxWords":1}'::jsonb,
 '"10"'::jsonb, '["ten"]'::jsonb),

('11111111-1111-1111-1111-111111111207'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 7, 'sentence_completion', 'After ___, coffee is the most sought-after commodity globally.',
 '{"template":"After ___","maxWords":2}'::jsonb,
 '"crude oil"'::jsonb, '[]'::jsonb),

('11111111-1111-1111-1111-111111111208'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 8, 'sentence_completion', 'The coffee industry employs more than ___ people.',
 '{"template":"___ people","maxWords":3}'::jsonb,
 '"20 million"'::jsonb, '["twenty million"]'::jsonb),

-- 9-13 Matching headings (one DB row, 5 sub-pairings)
('11111111-1111-1111-1111-111111111209'::uuid,
 '11111111-1111-1111-1111-111111111102'::uuid,
 9, 'matching_headings',
 'Match each paragraph A–E with the most appropriate heading i–viii.',
 '{"paragraphs":["A","B","C","D","E"],"headings":[
    {"key":"i","text":"A booming global industry"},
    {"key":"ii","text":"How coffee reached the Arab world"},
    {"key":"iii","text":"The legend of the dancing goats"},
    {"key":"iv","text":"A drink for emperors"},
    {"key":"v","text":"Botanical features of the plant"},
    {"key":"vi","text":"Coffee in modern medicine"},
    {"key":"vii","text":"Marketing coffee as medicine"},
    {"key":"viii","text":"The decline of tea in England"}
 ]}'::jsonb,
 '{"A":"iii","B":"ii","C":"vii","D":"v","E":"i"}'::jsonb,
 '[]'::jsonb);
