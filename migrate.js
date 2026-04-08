// Migrate existing JSON data to MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;

// Same schemas as server.js (simplified)
const examSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const userSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const subjectSchema = new mongoose.Schema({}, { strict: false });

const Exam = mongoose.model('Exam', examSchema);
const User = mongoose.model('User', userSchema);
const Subject = mongoose.model('Subject', subjectSchema);

async function migrate() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Migrate exams
    const examsFile = path.join(__dirname, 'data', 'exams.json');
    if (fs.existsSync(examsFile)) {
        const data = JSON.parse(fs.readFileSync(examsFile, 'utf-8'));
        if (data.exams?.length) {
            await Exam.deleteMany({});
            await Exam.insertMany(data.exams);
            console.log(`✅ Migrated ${data.exams.length} exams`);
        }
    }

    // Migrate users
    const usersFile = path.join(__dirname, 'data', 'users.json');
    if (fs.existsSync(usersFile)) {
        const data = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        if (data.users?.length) {
            await User.deleteMany({});
            await User.insertMany(data.users);
            console.log(`✅ Migrated ${data.users.length} users`);
        }
    }

    // Migrate subjects
    const subjectsFile = path.join(__dirname, 'data', 'subjects.json');
    if (fs.existsSync(subjectsFile)) {
        const data = JSON.parse(fs.readFileSync(subjectsFile, 'utf-8'));
        if (data.subjects?.length) {
            await Subject.deleteMany({});
            await Subject.insertMany(data.subjects);
            console.log(`✅ Migrated ${data.subjects.length} subjects`);
        }
    }

    console.log('\n🎉 Migration complete!');
    process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
