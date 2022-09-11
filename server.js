
const fs = require('fs');
const cp = require('child_process');
const clc = require('cli-color');
const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const express = require('express');
const bodyParser = require('body-parser');

function randomHex(length = 8) {
    let chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let str = '';
    for (i = 0; i < length; i++) {
        str += chars[Math.round(Math.random()*15)];
    }
    return str;
}

process.chdir(__dirname);

// Update database schema file
const schema = cp.spawn(`sqlite3`, [
    'main.db', '--cmd', 
    '.output database-schema.sql',
    '.schema',
    '.quit'
]);
schema.on('exit', () => {
    console.log(`Schema file updated`);
});

// Update list pending and completed task numbers
const db = new sqlite3('./main.db');
const lists = db.prepare(`SELECT id FROM lists`).all();
lists.forEach((list) => {
    const tasks = db.prepare(`SELECT is_complete FROM tasks WHERE list_id = ?`).all(list.id);
    let count = { pending: 0, complete: 0 };
    tasks.forEach((task) => {
        if (task.is_complete) count.complete++;
        else count.pending++;
    });
    db.prepare(`UPDATE lists SET count_pending = ?, count_complete = ? WHERE id = ?`).run(count.pending, count.complete, list.id);
});
db.close();

const srv = express();
srv.use(bodyParser.json({ type: 'application/json' }));
srv.use(express.static('web', {
    index: 'app.html'
}));

// Add global middleware
srv.use((req, res, next) => {
    // Set some variables
    req.query = new URLSearchParams(req.url.split('?')[1]);
    req.ua = req.headers['user-agent'] || false;
    req.clientIP = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    res.out = { success: true };
    res.db = false;
    // On request completion
    res.on('finish', () => {
        if (res.db) res.db.close();
        // Log
        let codeC = clc.yellow(res.statusCode);
        switch (res.statusCode.toString().substring(0, 1)) {
            case '2': codeC = clc.green(res.statusCode); break;
            case '3': codeC = clc.cyan(res.statusCode); break;
            case '4': codeC = clc.redBright(res.statusCode); break;
            case '5': codeC = clc.red(res.statusCode); break;
        }
        console.log(clc.cyanBright(req.clientIP), clc.yellowBright(req.method), codeC, clc.greenBright(req.url));
    });
    return next();
});

// Add middleware to all API requests
srv.use('/api/*', (req, res, next) => {
    // Open the database
    res.db = sqlite3('main.db');
    // Define extra functions
    res.json_end = (status = 200) => {
        res.status(status).json(res.out);
    }
    res.json_end_error = (short, message, status) => {
        res.out = {
            success: false,
            error: {
                code: short,
                message: message
            }
        };
        res.json_end(status);
    }
    req.is_param_valid = (param, isValid = false) => {
        if (!param || !isValid) {
            return res.json_end_error('badRequest', `One or more parameters are missing or invalid.`, 400);
        } else return true;
    };
    return next();
});

const get_active_user = (req, res, next) => {
    const token = req.headers['cybertasks-token'];
    const tokenEntry = res.db.prepare('SELECT * FROM auth WHERE token = ?').get(token);
    if (token && tokenEntry && (Date.now()-tokenEntry.last_seen) < (1000*60*60*24*30)) {
        res.db.prepare('UPDATE auth SET last_seen = ? WHERE token = ?').run(Date.now(), tokenEntry.token);
        const tokenOwnerId = tokenEntry.owner;
        req.user = res.db.prepare('SELECT * FROM users WHERE id = ?').get(tokenOwnerId);
        req.token = token;
    } else {
        return res.json_end_error('badToken', `Invalid or expired token.`, 401);
    }
    return next();
};

srv.get('/api/discordInfo', (req, res) => {
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
    res.out.client_id = credentials.client_id;
    res.out.redirect_url = credentials.redirect_url;
    return res.json_end();
});
srv.get('/api/me', get_active_user, (req, res) => {
    res.out.user = req.user;
    return res.json_end();
});
srv.post('/api/me/delete', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.post('/api/me/export', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.post('/api/me/keys/create', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.put('/api/me/keys/edit', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.delete('/api/me/keys/delete', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.get('/api/me/sessions', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.delete('/api/me/sessions/end', get_active_user, (req, res) => {
    res.db.prepare('DELETE FROM auth WHERE token = ? AND owner = ?').run(req.token, req.user.id);
    return res.json_end();
});
srv.get('/api/users/search', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.get('/api/lists', get_active_user, (req, res) => {
    res.out.lists = res.db.prepare('SELECT * FROM lists WHERE owner = ?').all(req.user.id) || {};
    res.out.folders = res.db.prepare('SELECT * FROM list_folders WHERE owner = ?').all(req.user.id) || {};
    return res.json_end();
});
srv.put('/api/lists/sort', get_active_user, (req, res) => {
    const order = req.body.order;
    if (!req.is_param_valid(order, order.length)) return;
    let i = 1;
    let isError = false;
    order.forEach((id) => {
        if (isError) return;
        let isFolder = false;
        let entry = res.db.prepare(`SELECT id FROM lists WHERE id = ? AND owner = ?`).get(id, req.user.id);
        if (!entry) {
            isFolder = true;
            entry = res.db.prepare(`SELECT id FROM list_folders WHERE id = ? AND owner = ?`).get(id, req.user.id);
            if (!entry) {
                isError = true;
                return req.is_param_valid(false, false);
            }
        }
        res.db.prepare(`UPDATE ${(isFolder) ? 'list_folders':'lists'} SET sort_pos = ? WHERE id = ? AND owner = ?`).run(i, id, req.user.id);
        i++;
    });
    if (isError) return;
    return res.json_end();
});
srv.post('/api/lists/create', get_active_user, (req, res) => {
    const name = req.body.name;
    const hue = req.body.hue;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    if (!req.is_param_valid((hue || hue === 0), (hue >= 0 && hue <= 360))) return;
    id = Date.now();
    res.db.prepare('INSERT INTO lists (id, owner, name, hue) VALUES (?, ?, ?, ?)').run(id, req.user.id, name, hue);
    res.out.list = res.db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    return res.json_end(201);
});
srv.put('/api/lists/:id/edit', get_active_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    const hue = req.body.hue;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    if (!req.is_param_valid((hue || hue === 0), (hue >= 0 && hue <= 360))) return;
    res.db.prepare(`UPDATE lists SET name = ?, hue = ? WHERE id = ? AND owner = ?`).run(name, hue, id, req.user.id);
    res.out.list = res.db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    return res.json_end();
});
srv.delete('/api/lists/:id/delete', get_active_user, (req, res) => {
    const id = req.params.id;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    res.db.prepare('DELETE FROM lists WHERE id = ? AND owner = ?').run(id, req.user.id);
    res.db.prepare('DELETE FROM tasks WHERE list_id = ? AND owner = ?').run(id, req.user.id);
    return res.json_end();
});
srv.post('/api/lists/folders/create', get_active_user, (req, res) => {
    const name = req.body.name;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    id = Date.now();
    res.db.prepare('INSERT INTO list_folders (id, owner, name) VALUES (?, ?, ?)').run(id, req.user.id, name);
    res.out.folder = res.db.prepare('SELECT * FROM list_folders WHERE id = ?').get(id);
    return res.json_end(201);
});
srv.put('/api/lists/folders/:id/edit', get_active_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM list_folders WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    res.db.prepare(`UPDATE list_folders SET name = ? WHERE id = ? AND owner = ?`).run(name, id, req.user.id);
    res.out.folder = res.db.prepare('SELECT * FROM list_folders WHERE id = ?').get(id);
    return res.json_end();
});
srv.delete('/api/lists/folders/:id/delete', get_active_user, (req, res) => {
    const id = req.params.id;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM list_folders WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    res.db.prepare('DELETE FROM list_folders WHERE id = ? AND owner = ?').run(id, req.user.id);
    return res.json_end();
});
srv.get('/api/lists/:id/tasks/pending', get_active_user, (req, res) => {
    const listId = req.params.id;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    res.out.tasks = res.db.prepare('SELECT * FROM tasks WHERE owner = ? AND list_id = ? AND is_complete = 0').all(req.user.id, listId) || [];
    for (let i = 0; i < res.out.tasks.length; i++) {
        res.out.tasks[i].steps = res.db.prepare('SELECT * FROM task_steps WHERE owner = ? AND task_id = ?').all(req.user.id, res.out.tasks[i].id) || [];
    }
    return res.json_end();
});
srv.get('/api/lists/:id/tasks/complete', get_active_user, (req, res) => {
    const listId = req.params.id;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    res.out.tasks = res.db.prepare('SELECT * FROM tasks WHERE owner = ? AND list_id = ? AND is_complete = 1').all(req.user.id, listId) || [];
    for (let i = 0; i < res.out.tasks.length; i++) {
        res.out.tasks[i].steps = res.db.prepare('SELECT * FROM task_steps WHERE owner = ? AND task_id = ?').all(req.user.id, res.out.tasks[i].id) || [];
    }
    return res.json_end();
});
srv.get('/api/lists/:id/users', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.post('/api/lists/:id/users/add', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.delete('/api/lists/:id/users/remove', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.get('/api/tasks/upcoming', get_active_user, (req, res) => {
    const days = parseInt(req.query.get('days')) || 7;
    if (!req.is_param_valid(days, (days > 0 && days <= 90))) return;
    res.out.tasks = res.db.prepare('SELECT * FROM tasks WHERE owner = ? AND due_date_time > 0 AND due_date_time < ? AND is_complete = 0').all(req.user.id, (Date.now()+(1000*60*60*24*days))) || [];
    for (let i = 0; i < res.out.tasks.length; i++) {
        res.out.tasks[i].steps = res.db.prepare('SELECT * FROM task_steps WHERE owner = ? AND task_id = ?').all(req.user.id, res.out.tasks[i].id) || [];
    }
    return res.json_end();
});
srv.put('/api/lists/:id/tasks/sort', get_active_user, (req, res) => {
    const id = req.params.id;
    const order = req.query.get('order');
    const reverse = (req.query.get('reverse') === 'true') ? 1 : 0;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    const validOrders = ['created', 'az', 'due'];
    if (!req.is_param_valid(order, validOrders.includes(order))) return;
    res.db.prepare(`UPDATE lists SET sort_order = ?, sort_reverse = ? WHERE id = ? AND owner = ?`).run(order, reverse, id, req.user.id);
    res.out.list = res.db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    return res.json_end();
});
srv.post('/api/lists/:id/tasks/create', get_active_user, (req, res) => {
    const listId = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 256))) return;
    const id = Date.now();
    res.db.prepare('INSERT INTO tasks (id, list_id, owner, name) VALUES (?, ?, ?, ?)').run(id, listId, req.user.id, name);
    res.db.prepare('UPDATE lists SET count_pending = count_pending + 1 WHERE id = ?').run(listId);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.out.task.steps = [];
    return res.json_end(201);
});
srv.put('/api/tasks/:id/edit', get_active_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT * FROM tasks WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    const name = req.body.name || entry.name;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 256))) return;
    let desc = req.body.desc;
    if (desc !== '') desc = desc || entry.desc || '';
    if (!req.is_param_valid(true, (desc.length < 2048))) return;
    let due = req.body.due_date || entry.due_date || null;
    if (due === 'null') due = null;
    let dueTime = new Date(due).getTime() || 0;
    if (!req.is_param_valid(true, (due === null || dueTime))) return;
    if (entry.name !== name)
        res.db.prepare(`UPDATE tasks SET name = ? WHERE id = ?`).run(name, id);
    if (entry.desc !== desc)
        res.db.prepare(`UPDATE tasks SET desc = ? WHERE id = ?`).run(desc, id);
    if (entry.due_date !== due)
        res.db.prepare(`UPDATE tasks SET due_date = ?, due_date_time = ? WHERE id = ?`).run(due, dueTime, id);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').get(id) || [];
    res.out.list = res.db.prepare('SELECT * FROM lists WHERE id = ?').get(entry.list_id);
    return res.json_end();
});
srv.put('/api/tasks/:id/toggleComplete', get_active_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, list_id, is_complete FROM tasks WHERE owner = ? AND id = ?`).get(req.user.id, id)
    if (!req.is_param_valid(id, entry)) return;
    const newCompletionStatus = (!entry.is_complete) ? 1 : 0;
    res.db.prepare('UPDATE tasks SET is_complete = ? WHERE id = ?').run(newCompletionStatus, id);
    if (newCompletionStatus) {
        res.db.prepare('UPDATE lists SET count_pending = count_pending - 1 WHERE id = ?').run(entry.list_id);
        res.db.prepare('UPDATE lists SET count_complete = count_complete + 1 WHERE id = ?').run(entry.list_id);
    } else {
        res.db.prepare('UPDATE lists SET count_pending = count_pending + 1 WHERE id = ?').run(entry.list_id);
        res.db.prepare('UPDATE lists SET count_complete = count_complete - 1 WHERE id = ?').run(entry.list_id);
    }
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').get(id) || [];
    res.out.list = res.db.prepare('SELECT * FROM lists WHERE id = ?').get(entry.list_id);
    return res.json_end();
});
srv.put('/api/tasks/:id/move', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.get('/api/tasks/:id/duplicate', get_active_user, (req, res) => {
    return res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
srv.delete('/api/tasks/:id/delete', get_active_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, list_id, is_complete FROM tasks WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    res.db.prepare('DELETE FROM tasks WHERE owner = ? AND id = ?').run(req.user.id, id);
    let countCol = 'count_pending';
    if (parseInt(entry.is_complete)) countCol = 'count_complete';
    res.db.prepare(`UPDATE lists SET ${countCol} = ${countCol} - 1 WHERE id = ?`).run(entry.list_id);
    return res.json_end();
});
srv.post('/api/tasks/:id/steps/create', get_active_user, (req, res) => {
    const taskId = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(taskId, res.db.prepare('SELECT id FROM tasks WHERE owner = ? AND id = ?').get(req.user.id, taskId))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 128))) return;
    const id = Date.now();
    res.db.prepare('INSERT INTO task_steps (id, task_id, owner, name) VALUES (?, ?, ?, ?)').run(id, taskId, req.user.id, name);
    res.out.step = res.db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').get(taskId) || [];
    return res.json_end(201);
});
srv.put('/api/steps/:id/edit', get_active_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    res.db.prepare('UPDATE task_steps SET name = ? WHERE id = ?').run(name, id);
    res.out.step = res.db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(entry.task_id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(entry.task_id) || [];
    return res.json_end();
});
srv.put('/api/steps/:id/toggleComplete', get_active_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    const newCompletionStatus = (!entry.is_complete) ? 1 : 0;
    res.db.prepare('UPDATE task_steps SET is_complete = ? WHERE id = ?').run(newCompletionStatus, id);
    res.out.step = res.db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(entry.task_id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(entry.task_id) || [];
    return res.json_end();
});
srv.delete('/api/steps/:id/delete', get_active_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    res.db.prepare('DELETE FROM task_steps WHERE owner = ? AND id = ?').run(req.user.id, id);
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(entry.task_id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(entry.task_id) || [];
    return res.json_end();
});
srv.put('/api/tasks/:id/steps/sort', get_active_user, (req, res) => {
    const id = req.params.id;
    const order = req.body.order;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM tasks WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(order, true)) return;
    let i = 1;
    order.forEach((id) => {
        res.db.prepare(`UPDATE task_steps SET sort_pos = ? WHERE id = ? AND owner = ?`).run(i, id, req.user.id);
        i++;
    });
    res.out.task = res.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.out.task.steps = res.db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(id) || [];
    return res.json_end();
});

// Handle Discord login
srv.get('/discord-callback', (req, res) => {
    res.redirect(`/?discord_code=${req.query.get('code')}`);
});
srv.get('/discord-login', async(req, res) => {
    res.db = new sqlite3('./main.db');
    // Make sure a code is supplied
    const code = req.query.get('code');
    if (!code) return res.status(400).json({ error: 'missingCode' });
    // Read in credentials
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
    // Fetch the user access code using the provided code
    const resAccess = await (await fetch(`https://discord.com/api/v10/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': credentials.redirect_url
        })
    })).json();
    // Respond with an error if there's no access token
    if (!resAccess.access_token)
        return res.status(401).json({ error: 'authFailed' });
    // Use the new access token to fetch user info
    const resUser = await (await fetch(`https://discord.com/api/v10/users/@me`, {
        headers: { 'Authorization': `Bearer ${resAccess.access_token}` }
    })).json();
    // Respond with an error if there's no user info
    if (!resUser.id) 
        return res.status(500).json({ error: 'getUserFailed' });
    // Get the user entry from the database if it exists
    const storedUser = res.db.prepare('SELECT * FROM users WHERE discord_id = ?').get(resUser.id);
    // Respond with an error if this Discord account isn't approved
    // and if it doesn't already exist in the database
    if (!credentials.allow_new_users && !storedUser) {
        const approvedIds = JSON.parse(fs.readFileSync('./allowedUsers.json', 'utf-8'));
        if (!approvedIds.includes(resUser.id.toString()))
            return res.status(403).json({ error: 'notApproved' });
    }
    // Save the current timestamp to use as a new user ID
    const newUserId = Date.now();
    // If the user doesn't exist
    if (!storedUser) {
        // Create a shiny new user in the database
        res.db.prepare('INSERT INTO users (id, discord_id, name, discriminator, picture) VALUES (?, ?, ?, ?, ?)').run(newUserId, resUser.id, resUser.username, resUser.discriminator, resUser.avatar);
        // Add a new list and task for the user
        const listId = Date.now();
        res.db.prepare('INSERT INTO lists (id, owner, name, hue, count_pending) VALUES (?, ?, ?, ?, ?)').run(listId, newUserId, 'To-do', 200, 1);
        res.db.prepare('INSERT INTO tasks (id, list_id, owner, name, desc) VALUES (?, ?, ?, ?, ?)').run(Date.now(), listId, newUserId, 'Start using CyberTasks', `You can use this list as a space to see what CyberTasks has to offer!`);
    } else {
        // If they do exist, update their profile details to match Discord
        res.db.prepare('UPDATE users SET name = ?, discriminator = ?, picture = ? WHERE discord_id = ?').run(resUser.username, resUser.discriminator, resUser.avatar, resUser.id);
    }
    // Generate a new token
    const token = randomHex(256);
    // Make a new token entry
    res.db.prepare('INSERT INTO auth (id, owner, token, last_seen, ua) VALUES (?, ?, ?, ?, ?)').run(Date.now(), storedUser.id || newUserId, token, Date.now(), req.ua);
    // Respond with the new token
    return res.json({ token: token });
});

const port = 8726;
srv.listen(port, () => {
    console.log(`Listening on port ${port}`);
});