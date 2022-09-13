
// This script is used when any mass database updates need to be made

const sqlite3 = require('better-sqlite3');
const dayjs = require('dayjs');

const db = sqlite3('main.db');
const tasks = db.prepare(`SELECT * FROM tasks`).all();
tasks.forEach((task) => {
    let newDateString = null;
    if (task.due_date_time) {
        const date = new Date(task.due_date_time);
        newDateString = dayjs(date).format('YYYY-MM-DDT00:00:00');
    }
    console.log(task.due_date, '=>', newDateString);
    db.prepare(`UPDATE tasks SET due_date = ? WHERE id = ?`).run(newDateString, task.id);
});
db.close();