// lib/repos/index.js — convenience barrel + initialization
'use strict';
module.exports = {
    pool: require('./_pool'),
    users: require('./users'),
    settings: require('./settings'),
    subjects: require('./subjects'),
    exams: require('./exams'),
    questionBank: require('./questionBank'),
    media: require('./media'),
    ielts: require('./ielts'),
    ieltsCodes: require('./ielts-codes')
};
