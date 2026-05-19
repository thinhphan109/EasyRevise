-- migrations/003a_seed_band_tables.sql
-- Reading band lookup for Academic and General Training.
-- Listening / Writing / Speaking inserted later.

-- Wipe existing reading rows so re-running is idempotent.
DELETE FROM ielts_band_tables WHERE skill = 'reading';

-- ── Academic Reading (raw 0..40) ────────────────────────────────
INSERT INTO ielts_band_tables (skill, module, raw_score, band_score) VALUES
    ('reading','academic',40,9.0),('reading','academic',39,9.0),
    ('reading','academic',38,8.5),('reading','academic',37,8.5),
    ('reading','academic',36,8.0),('reading','academic',35,8.0),
    ('reading','academic',34,7.5),('reading','academic',33,7.5),
    ('reading','academic',32,7.0),('reading','academic',31,7.0),('reading','academic',30,7.0),
    ('reading','academic',29,6.5),('reading','academic',28,6.5),('reading','academic',27,6.5),
    ('reading','academic',26,6.0),('reading','academic',25,6.0),('reading','academic',24,6.0),('reading','academic',23,6.0),
    ('reading','academic',22,5.5),('reading','academic',21,5.5),('reading','academic',20,5.5),('reading','academic',19,5.5),
    ('reading','academic',18,5.0),('reading','academic',17,5.0),('reading','academic',16,5.0),('reading','academic',15,5.0),
    ('reading','academic',14,4.5),('reading','academic',13,4.5),
    ('reading','academic',12,4.0),('reading','academic',11,4.0),('reading','academic',10,4.0),
    ('reading','academic',9,3.5),('reading','academic',8,3.5),
    ('reading','academic',7,3.0),('reading','academic',6,3.0),
    ('reading','academic',5,2.5),('reading','academic',4,2.5),
    ('reading','academic',3,2.0),('reading','academic',2,2.0),
    ('reading','academic',1,1.5),('reading','academic',0,0.0);

-- ── General Training Reading (raw 0..40 — different curve) ──────
INSERT INTO ielts_band_tables (skill, module, raw_score, band_score) VALUES
    ('reading','general_training',40,9.0),
    ('reading','general_training',39,8.5),
    ('reading','general_training',38,8.0),('reading','general_training',37,8.0),
    ('reading','general_training',36,7.5),
    ('reading','general_training',35,7.0),('reading','general_training',34,7.0),
    ('reading','general_training',33,6.5),('reading','general_training',32,6.5),
    ('reading','general_training',31,6.0),('reading','general_training',30,6.0),
    ('reading','general_training',29,5.5),('reading','general_training',28,5.5),('reading','general_training',27,5.5),
    ('reading','general_training',26,5.0),('reading','general_training',25,5.0),('reading','general_training',24,5.0),('reading','general_training',23,5.0),
    ('reading','general_training',22,4.5),('reading','general_training',21,4.5),('reading','general_training',20,4.5),('reading','general_training',19,4.5),
    ('reading','general_training',18,4.0),('reading','general_training',17,4.0),('reading','general_training',16,4.0),('reading','general_training',15,4.0),
    ('reading','general_training',14,3.5),('reading','general_training',13,3.5),('reading','general_training',12,3.5),
    ('reading','general_training',11,3.0),('reading','general_training',10,3.0),
    ('reading','general_training',9,2.5),('reading','general_training',8,2.5),
    ('reading','general_training',7,2.0),('reading','general_training',6,2.0),
    ('reading','general_training',5,1.5),('reading','general_training',4,1.5),
    ('reading','general_training',3,1.0),('reading','general_training',2,1.0),
    ('reading','general_training',1,1.0),('reading','general_training',0,0.0);
