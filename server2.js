
const fs = require('fs');
const path = require('path');
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
    return next();
});

srv.get('/discordInfo', (req, res) => {
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
    res.out.client_id = credentials.client_id;
    res.out.redirect_url = credentials.redirect_url;
    return res.json(out);
});

const return_error = (req, res, code, message, status) => {
    out.success = false;
    out.error = {
        code: code,
        message: message
    }
    res.status(status).json(out);
}
const get_active_user = (req, res, next) => {
    const token = req.headers['cybertasks-token'];
    const tokenEntry = res.db.prepare('SELECT * FROM auth WHERE token = ?').get(token);
    if (token && tokenEntry && (Date.now()-tokenEntry.last_seen) < (1000*60*60*24*30)) {
        res.db.prepare('UPDATE auth SET last_seen = ? WHERE token = ?').run(Date.now(), tokenEntry.token);
        const tokenOwnerId = tokenEntry.owner;
        req.user = res.db.prepare('SELECT * FROM users WHERE id = ?').get(tokenOwnerId);
    } else {
        return return_error(req, res, 'badToken', `Invalid or expired token.`, 401);
    }
    return next();
};

srv.get('/api/me', get_active_user, (req, res) => {
    res.out.user = req.user;
    return res.json(res.out);
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
    const storedUser = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(resUser.id);
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
        db.prepare('INSERT INTO users (id, discord_id, name, discriminator, picture) VALUES (?, ?, ?, ?, ?)').run(newUserId, resUser.id, resUser.username, resUser.discriminator, resUser.avatar);
        // Add a new list and task for the user
        const listId = Date.now();
        db.prepare('INSERT INTO lists (id, owner, name, hue, count_pending) VALUES (?, ?, ?, ?, ?)').run(listId, newUserId, 'To-do', 200, 1);
        db.prepare('INSERT INTO tasks (id, list_id, owner, name, desc) VALUES (?, ?, ?, ?, ?)').run(Date.now(), listId, newUserId, 'Start using CyberTasks', `You can use this list as a space to see what CyberTasks has to offer!`);
    } else {
        // If they do exist, update their profile details to match Discord
        db.prepare('UPDATE users SET name = ?, discriminator = ?, picture = ? WHERE discord_id = ?').run(resUser.username, resUser.discriminator, resUser.avatar, resUser.id);
    }
    // Generate a new token
    const token = randomHex(256);
    // Make a new token entry
    db.prepare('INSERT INTO auth (id, owner, token, last_seen, ua) VALUES (?, ?, ?, ?, ?)').run(Date.now(), storedUser.id || newUserId, token, Date.now(), ua);
    // Respond with the new token
    return res.json({ token: token });
});

const port = 8727;
srv.listen(port, () => {
    console.log(`Listening on port ${port}`);
});