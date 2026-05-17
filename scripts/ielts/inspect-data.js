const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..', '..', 'data');

function inspect(file, listKey) {
    const fp = path.join(D, file);
    if (!fs.existsSync(fp)) { console.log(`× ${file}: missing`); return; }
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (listKey && Array.isArray(j[listKey])) {
        console.log(`\n── ${file} (${j[listKey].length} ${listKey}) ──`);
        if (j[listKey][0]) {
            console.log('  keys:', Object.keys(j[listKey][0]).join(', '));
        }
    } else {
        console.log(`\n── ${file} ──`);
        console.log('  top-level keys:', Object.keys(j).join(', '));
    }
}
inspect('users.json', 'users');
inspect('exams.json', 'exams');
inspect('subjects.json', 'subjects');
inspect('questions.json', 'questions');
inspect('settings.json', null);
inspect('media.json', null);

// Show one user (without password) and one exam (truncated)
const u = JSON.parse(fs.readFileSync(path.join(D, 'users.json'), 'utf8'));
if (u.users && u.users[0]) {
    const sample = { ...u.users[0] };
    sample.passwordHash = sample.passwordHash ? '<redacted ' + sample.passwordHash.length + ' chars>' : null;
    if (sample.history) sample.history = `<${sample.history.length} entries>`;
    console.log('\n── sample user ──');
    console.log(JSON.stringify(sample, null, 2));
}
const e = JSON.parse(fs.readFileSync(path.join(D, 'exams.json'), 'utf8'));
if (e.exams && e.exams[0]) {
    const ex = e.exams[0];
    console.log('\n── sample exam (counts) ──');
    console.log({
        id: ex.id, title: ex.title, subject: ex.subject,
        sections: (ex.sections || []).length,
        totalQuestions: (ex.sections || []).reduce((s, sec) => s + (sec.questions || []).length, 0),
        codes: ex.codes ? ex.codes.length : 0,
        keys: Object.keys(ex).join(',')
    });
    if (ex.sections && ex.sections[0]) {
        console.log('  section keys:', Object.keys(ex.sections[0]).join(','));
        if (ex.sections[0].questions && ex.sections[0].questions[0]) {
            console.log('  question keys:', Object.keys(ex.sections[0].questions[0]).join(','));
        }
    }
    if (ex.codes && ex.codes[0]) {
        console.log('  code keys:', Object.keys(ex.codes[0]).join(','));
    }
}
