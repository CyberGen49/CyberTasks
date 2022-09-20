
process.chdir(__dirname);

const fs = require('fs');
const cp = require('child_process');
const clc = require('cli-color');
const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const express = require('express');
const bodyParser = require('body-parser');
const Discord = require('discord.js');

function randomHex(length = 8) {
    let chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let str = '';
    for (i = 0; i < length; i++) {
        str += chars[Math.round(Math.random()*15)];
    }
    return str;
}

let isDev = false;
let devConfig = {};
if (fs.existsSync('devConfig.json')) {
    isDev = true;
    devConfig = JSON.parse(fs.readFileSync('devConfig.json', 'utf-8'));
    console.log(`Loaded development config:`, devConfig);
}
const dbPath = devConfig.db_path || './main.db';

// Update database schema file
const schema = cp.spawn(`sqlite3`, [
    dbPath, '--cmd', 
    '.output database-schema.sql',
    '.schema',
    '.quit'
]);
schema.on('exit', () => {
    console.log(`Schema file updated`);
});

// Update list pending and completed task numbers
const db = new sqlite3(dbPath);
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

// Set up server
const srv = express();
srv.disable('etag');
srv.use(bodyParser.json({ type: 'application/json' }));

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

// Set static files folder
srv.use(express.static('web', {
    index: 'app.html'
}));

// Add middleware to all API requests
srv.use('/api/*', (req, res, next) => {
    // Open the database
    res.db = sqlite3(dbPath);
    // Set default scope (checked against API keys)
    res.scope = '';
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
            res.json_end_error('badRequest', `One or more parameters are missing or invalid.`, 400);
        } else return true;
    };
    return next();
});

// Returns database statistics
function get_db_stats() {
    let stats = {};
    stats.size = fs.statSync(dbPath).size;
    const db = new sqlite3(dbPath);
    stats.count = {
        users: db.prepare(`SELECT count(id) FROM users`).get()['count(id)'],
        lists: db.prepare(`SELECT count(id) FROM lists`).get()['count(id)'],
        tasks: db.prepare(`SELECT count(id) FROM tasks`).get()['count(id)'],
        steps: db.prepare(`SELECT count(id) FROM task_steps`).get()['count(id)']
    };
    db.close();
    return stats;
}
// Set up Discord bot
const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
let bot = false;
let channel = false;
if (credentials.bot_token && credentials.audits_channel) {
    bot = new Discord.Client({ intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ] });
    bot.on('ready', () => {
        console.log(`Audit logging bot is ready!`);
        channel = bot.channels.cache.get(credentials.audits_channel);
        bot.on('messageCreate', async(msg) => {
            if (msg.author.bot || msg.channelId != credentials.audits_channel)
                return
            switch (msg.content.toLowerCase()) {
                case 's':
                    if (credentials.disable_stats_command) break;
                    const reply = await msg.reply(`Hang tight...`);
                    const stats = get_db_stats();
                    const lines = [
                        `Users: **${stats.count.users.toLocaleString()}**`,
                        `Lists: **${stats.count.lists.toLocaleString()}**`,
                        `Tasks: **${stats.count.tasks.toLocaleString()}**`,
                        `Steps: **${stats.count.steps.toLocaleString()}**`,
                        ``,
                        `DB Size: **${Math.round(stats.size/1024).toLocaleString()} KB**`,
                    ];
                    reply.edit({ content: null, embeds: [
                        new Discord.EmbedBuilder()
                            .setColor(0x79c6ec)
                            .setTitle(`CyberTasks Stats`)
                            .setDescription(lines.join('\n'))
                    ] })
                    break;
                default: await msg.react('❌'); break;
            }
        });
    });
    bot.login(credentials.bot_token);
} else {
    console.log(`Audit logs disabled, missing bot token and/or audits_channel ID`);
}
// Sends an audit log if they're set up
function send_audit(user, msg, type = 0) {
    if (!channel) return;
    let colour = 0x79ec79; // 120, 75%, 70%
    if (type == 1) colour = 0x79c6ec;
    if (type == 2) colour = 0xfc7979;
    channel.send({ embeds: [
        new Discord.EmbedBuilder()
            .setColor(colour)
            .setDescription(`[**${user.name}#${user.discriminator}**](https://discordlookup.com/user/${user.discord_id}) ${msg}`)
    ] });
}

// Fetches any Discord user by their ID
let discordUserCache = {};
async function getDiscordUserById(id) {
    if (discordUserCache[id] && (Date.now()-discordUserCache[id].created) < (1000*60*60*24))
        return discordUserCache[id];
    const res = await fetch(`https://discord.com/api/v9/users/${id}`, {
        headers: {
            Authorization: `Bot ${credentials.bot_token}`
        }
    });
    if (!res.ok) return false;
    const user = await res.json();
    discordUserCache[id] = user;
    discordUserCache[id].created = Date.now();
    return user;
}

// Sets the API endpoints scope to be used with API keys
const setScope = (scope) => {
    return (req, res, next) => {
        req.scope = scope;
        return next();
    }
}

// Gets the active user from the provided access token or API key
// and binds the user object to the request
const get_user = (req, res, next) => {
    const token = req.headers['cybertasks-token'];
    const key = req.headers['cybertasks-key'];
    if (token) {
        const tokenEntry = res.db.prepare('SELECT * FROM auth WHERE token = ?').get(token);
        if (token && tokenEntry && (Date.now()-tokenEntry.last_seen) < (1000*60*60*24*30)) {
            res.db.prepare('UPDATE auth SET last_seen = ?, ua = ?, ip = ? WHERE token = ?').run(Date.now(), req.ua, req.clientIP, tokenEntry.token);
            const tokenOwnerId = tokenEntry.owner;
            req.user = res.db.prepare('SELECT * FROM users WHERE id = ?').get(tokenOwnerId);
            req.token = token;
        } else {
            res.json_end_error('badToken', `Invalid or expired token.`, 401);
        }
    } else if (key) {
        // ...
    } else {
        res.json_end_error('accessDenied', `Missing access token or API key.`, 403);
    }
    return next();
};

// Makes sure the user is an admin before continuing
const check_admin = (req, res, next) => {
    if (!req.user.is_admin) {
        return res.json_end_error('accessDenied', `Only admins can use this API endpoint.`, 403);
    }
    return next();
};

// Database shortcuts
function getLists(db, user) {
    return db.prepare('SELECT * FROM lists WHERE owner = ?').all(user.id);
}
function getList(db, id) {
    return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}
function getFolders(db, user) {
    return db.prepare('SELECT * FROM list_folders WHERE owner = ?').all(user.id);
}
function getFolder(db, id) {
    return db.prepare('SELECT * FROM list_folders WHERE id = ?').get(id);
}
function getTasks(db, user, opts) {
    let tasks;
    if (opts.list_id) {
        tasks = db.prepare('SELECT * FROM tasks WHERE owner = ? AND list_id = ? AND is_complete = ?').all(user.id, opts.list_id, opts.is_complete) || [];
    } else {
        tasks = db.prepare('SELECT * FROM tasks WHERE owner = ? AND due_date_time > 0 AND due_date_time < ? AND is_complete = 0').all(user.id, (Date.now()+(1000*60*60*24*opts.days))) || [];
    }
    for (let i = 0; i < tasks.length; i++) {
        tasks[i].steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(tasks[i].id) || [];
    }
    return tasks;
}
function getTask(db, id) {
    let task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    task.steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ?').all(id) || [];
    return task;
}
function getStep(db, id) {
    return db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id);
}

// Get Discord credential information
srv.get('/api/discordInfo', (req, res) => {
    res.out.client_id = credentials.client_id;
    res.out.redirect_url = credentials.redirect_url;
    res.json_end();
});
// Get IP location information
srv.get('/api/ipLookup', async(req, res) => {
    const ip = req.query.get('ip');
    if (!req.is_param_valid(ip, true)) return;
    res.out.response = await (await fetch(`http://ip-api.com/json/${ip}`)).json();
    res.json_end();
});
// Get current user object
srv.get('/api/me', setScope('me'), get_user, (req, res) => {
    res.out.user = req.user;
    res.json_end();
});
// Delete the current user and all of its data
srv.post('/api/me/delete', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Export user data to a zip file and save a link to it
srv.post('/api/me/export', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Get API keys
srv.get('/api/me/keys', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Create API key
srv.post('/api/me/keys/create', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Edit API key
srv.put('/api/me/keys/edit', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Delete API key
srv.delete('/api/me/keys/delete', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Get active sessions
srv.get('/api/me/sessions', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// End the current session
srv.delete('/api/me/sessions/end', get_user, (req, res) => {
    res.db.prepare('DELETE FROM auth WHERE token = ? AND owner = ?').run(req.token, req.user.id);
    res.json_end();
    send_audit(req.user, `ended a session`);
});
// Get Discord user by ID
srv.get('/api/discordUser/:id', get_user, check_admin, async(req, res) => {
    const id = req.params.id;
    if (!req.is_param_valid(id, true)) return;
    const user = await getDiscordUserById(id);
    if (!req.is_param_valid(user, true)) return;
    res.out.user = user;
    res.json_end();
});
// Get all allowed Discord users
srv.get('/api/users/allowed', get_user, check_admin, async(req, res) => {
    res.out.ids = require('./allowedUsers.json');
    res.out.users = [];
    for (const id of res.out.ids) {
        let user = { id: id };
        user = await getDiscordUserById(id);
        res.out.users.push(user);
    }
    res.json_end();
});
// Allow a Discord user to access CyberTasks
srv.post('/api/users/allowed/add', get_user, check_admin, async(req, res) => {
    const id = req.body.id.toString();
    if (!req.is_param_valid(id, true)) return;
    const user = await getDiscordUserById(id);
    if (!req.is_param_valid(user, true)) return;
    let allowedUsers = require('./allowedUsers.json');
    if (!allowedUsers.includes(id)) allowedUsers.push(id);
    fs.writeFileSync('./allowedUsers.json', JSON.stringify(allowedUsers, null, 4));
    res.json_end();
    send_audit(req.user, `added [**${user.username}#${user.discriminator}**](https://discordlookup.com/user/${user.discord_id}) to allowed users`);
});
// Remove an allowed user
srv.delete('/api/users/allowed/remove', get_user, check_admin, async(req, res) => {
    const id = req.body.id.toString();
    if (!req.is_param_valid(id, true)) return;
    const user = await getDiscordUserById(id);
    let allowedUsers = require('./allowedUsers.json');
    const index = allowedUsers.indexOf(id);
    if (index > -1) allowedUsers.splice(index, 1);
    fs.writeFileSync('./allowedUsers.json', JSON.stringify(allowedUsers, null, 4));
    res.json_end();
    send_audit(req.user, `removed [**${user.username}#${user.discriminator}**](https://discordlookup.com/user/${user.discord_id}) from allowed users`, 2);
});
// Search users
srv.get('/api/users/search', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Get lists
srv.get('/api/lists', get_user, (req, res) => {
    res.out.lists = getLists(res.db, req.user);
    res.out.folders = getFolders(res.db, req.user);
    res.json_end();
});
// Sort sidebar
srv.put('/api/lists/sort', get_user, (req, res) => {
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
    res.json_end();
});
// Create list
srv.post('/api/lists/create', get_user, (req, res) => {
    const name = req.body.name;
    const hue = req.body.hue;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    if (!req.is_param_valid((hue || hue === 0), (hue >= 0 && hue <= 360))) return;
    id = Date.now();
    res.db.prepare('INSERT INTO lists (id, owner, name, hue) VALUES (?, ?, ?, ?)').run(id, req.user.id, name, hue);
    res.out.list = getList(res.db, id);
    res.json_end(201);
    send_audit(req.user, `created a list`);
});
// Edit list
srv.put('/api/lists/:id/edit', get_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    const hue = req.body.hue;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    if (!req.is_param_valid((hue || hue === 0), (hue >= 0 && hue <= 360))) return;
    res.db.prepare(`UPDATE lists SET name = ?, hue = ? WHERE id = ? AND owner = ?`).run(name, hue, id, req.user.id);
    res.out.list = getList(res.db, id);
    res.json_end();
});
// Delete list
srv.delete('/api/lists/:id/delete', get_user, (req, res) => {
    const id = req.params.id;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    // Delete list entry
    res.db.prepare('DELETE FROM lists WHERE id = ? AND owner = ?').run(id, req.user.id);
    // Get tasks
    const tasks = [
        ...getTasks(res.db, req.user, { list_id: id, is_complete: 0 }),
        ...getTasks(res.db, req.user, { list_id: id, is_complete: 1 })
    ];
    // Delete all tasks from this list
    res.db.prepare('DELETE FROM tasks WHERE list_id = ? AND owner = ?').run(id, req.user.id);
    // Delete all task steps from these tasks
    let stepsCount = 0;
    tasks.forEach((task) => {
        stepsCount += task.steps.length;
        res.db.prepare('DELETE FROM task_steps WHERE task_id = ? AND owner = ?').run(task.id, req.user.id);
    });
    res.json_end();
    send_audit(req.user, `deleted a list containing ${tasks.length} task(s) with ${stepsCount} step(s)`, 2);
});
// Create list folder
srv.post('/api/lists/folders/create', get_user, (req, res) => {
    const name = req.body.name;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    id = Date.now();
    res.db.prepare('INSERT INTO list_folders (id, owner, name) VALUES (?, ?, ?)').run(id, req.user.id, name);
    res.out.folder = getFolder(res.db, id);
    res.json_end(201);
    send_audit(req.user, `created a list category`);
});
// Edit list folder
srv.put('/api/lists/folders/:id/edit', get_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM list_folders WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 64)))
        return;
    res.db.prepare(`UPDATE list_folders SET name = ? WHERE id = ? AND owner = ?`).run(name, id, req.user.id);
    res.out.folder = getFolder(res.db, id);
    res.json_end();
});
// Delete list folder
srv.delete('/api/lists/folders/:id/delete', get_user, (req, res) => {
    const id = req.params.id;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM list_folders WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    res.db.prepare('DELETE FROM list_folders WHERE id = ? AND owner = ?').run(id, req.user.id);
    res.json_end();
    send_audit(req.user, `deleted a list category`, 2);
});
// Get list pending tasks
srv.get('/api/lists/:id/tasks/pending', get_user, (req, res) => {
    const listId = req.params.id;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    res.out.tasks = getTasks(res.db, req.user, {
        list_id: listId,
        is_complete: 0
    });
    res.json_end();
});
// Get list complete tasks
srv.get('/api/lists/:id/tasks/complete', get_user, (req, res) => {
    const listId = req.params.id;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    res.out.tasks = getTasks(res.db, req.user, {
        list_id: listId,
        is_complete: 1
    });
    res.json_end();
});
// Get global upcoming and past due tasks
srv.get('/api/tasks/upcoming', get_user, (req, res) => {
    const days = parseInt(req.query.get('days')) || 7;
    if (!req.is_param_valid(days, (days > 0 && days <= 90))) return;
    res.out.tasks = getTasks(res.db, req.user, { days: days });
    res.json_end();
});
// Get list collaborators
srv.get('/api/lists/:id/users', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Add list collaborators
srv.post('/api/lists/:id/users/add', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Remove list collaborators
srv.delete('/api/lists/:id/users/remove', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Change list sort order
srv.put('/api/lists/:id/tasks/sort', get_user, (req, res) => {
    const id = req.params.id;
    const order = req.query.get('order');
    const reverse = (req.query.get('reverse') === 'true') ? 1 : 0;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    const validOrders = ['created', 'az', 'due'];
    if (!req.is_param_valid(order, validOrders.includes(order))) return;
    res.db.prepare(`UPDATE lists SET sort_order = ?, sort_reverse = ? WHERE id = ? AND owner = ?`).run(order, reverse, id, req.user.id);
    res.out.list = getList(res.db, id);
    res.json_end();
});
// Create task
srv.post('/api/lists/:id/tasks/create', get_user, (req, res) => {
    const listId = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(listId, res.db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(req.user.id, listId))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 256))) return;
    const id = Date.now();
    res.db.prepare('INSERT INTO tasks (id, list_id, owner, name) VALUES (?, ?, ?, ?)').run(id, listId, req.user.id, name);
    res.db.prepare('UPDATE lists SET count_pending = count_pending + 1 WHERE id = ?').run(listId);
    res.out.task = getTask(res.db, id);
    res.json_end(201);
    send_audit(req.user, `created a task`);
});
// Edit task
srv.put('/api/tasks/:id/edit', get_user, (req, res) => {
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
    if (!req.is_param_valid(true, (due === null || (dueTime && due.match(/^\d{4}-\d{2}-\d{2}T00:00:00$/)))))
        return;
    if (entry.name !== name)
        res.db.prepare(`UPDATE tasks SET name = ? WHERE id = ?`).run(name, id);
    if (entry.desc !== desc)
        res.db.prepare(`UPDATE tasks SET desc = ? WHERE id = ?`).run(desc, id);
    if (entry.due_date !== due)
        res.db.prepare(`UPDATE tasks SET due_date = ?, due_date_time = ? WHERE id = ?`).run(due, dueTime, id);
    res.out.task = getTask(res.db, id);
    res.out.list = getList(res.db, entry.list_id);
    res.json_end();
});
// Toggle task completion status
srv.put('/api/tasks/:id/toggleComplete', get_user, (req, res) => {
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
    res.out.task = getTask(res.db, id);
    res.out.list = getList(res.db, entry.list_id);
    res.json_end();
});
// Move task to another list
srv.put('/api/tasks/:id/move', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Duplicate task
srv.get('/api/tasks/:id/duplicate', get_user, (req, res) => {
    res.json_end_error('notImplemented', `This endpoint isn't implemented yet!`, 501);
});
// Delete task
srv.delete('/api/tasks/:id/delete', get_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT list_id, is_complete FROM tasks WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    // Delete task entry
    res.db.prepare('DELETE FROM tasks WHERE owner = ? AND id = ?').run(req.user.id, id);
    // Get number of steps
    const stepsCount = res.db.prepare(`SELECT count(id) FROM task_steps WHERE task_id = ?`).get(id)['count(id)'];
    // Delete steps from this task
    res.db.prepare('DELETE FROM task_steps WHERE owner = ? AND task_id = ?').run(req.user.id, id);
    // Update list task count
    let countCol = 'count_pending';
    if (parseInt(entry.is_complete)) countCol = 'count_complete';
    res.db.prepare(`UPDATE lists SET ${countCol} = ${countCol} - 1 WHERE id = ?`).run(entry.list_id);
    res.out.list = getList(res.db, entry.list_id);
    res.json_end();
    send_audit(req.user, `deleted a task with ${stepsCount} step(s)`, 2);
});
// Create task step
srv.post('/api/tasks/:id/steps/create', get_user, (req, res) => {
    const taskId = req.params.id;
    const name = req.body.name;
    if (!req.is_param_valid(taskId, res.db.prepare('SELECT id FROM tasks WHERE owner = ? AND id = ?').get(req.user.id, taskId))) return;
    if (!req.is_param_valid(name, (name.length > 0 && name.length < 128))) return;
    const id = Date.now();
    res.db.prepare('INSERT INTO task_steps (id, task_id, owner, name) VALUES (?, ?, ?, ?)').run(id, taskId, req.user.id, name);
    res.out.step = getStep(res.db, id);
    res.out.task = getTask(res.db, taskId);
    res.json_end(201);
    send_audit(req.user, `added a task step`);
});
// Edit task step
srv.put('/api/steps/:id/edit', get_user, (req, res) => {
    const id = req.params.id;
    const name = req.body.name;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    res.db.prepare('UPDATE task_steps SET name = ? WHERE id = ?').run(name, id);
    res.out.step = getStep(res.db, id);
    res.out.task = getTask(res.db, entry.task_id);
    res.json_end();
});
// Toggle task step completion status
srv.put('/api/steps/:id/toggleComplete', get_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    const newCompletionStatus = (!entry.is_complete) ? 1 : 0;
    res.db.prepare('UPDATE task_steps SET is_complete = ? WHERE id = ?').run(newCompletionStatus, id);
    res.out.step = getStep(res.db, id);
    res.out.task = getTask(res.db, entry.task_id);
    res.json_end();
});
// Delete task step
srv.delete('/api/steps/:id/delete', get_user, (req, res) => {
    const id = req.params.id;
    const entry = res.db.prepare(`SELECT id, task_id, is_complete FROM task_steps WHERE owner = ? AND id = ?`).get(req.user.id, id);
    if (!req.is_param_valid(id, entry)) return;
    res.db.prepare('DELETE FROM task_steps WHERE owner = ? AND id = ?').run(req.user.id, id);
    res.out.task = getTask(res.db, entry.task_id);
    res.json_end();
    send_audit(req.user, `deleted a task step`, 2);
});
// Sort task steps
srv.put('/api/tasks/:id/steps/sort', get_user, (req, res) => {
    const id = req.params.id;
    const order = req.body.order;
    if (!req.is_param_valid(id, res.db.prepare('SELECT id FROM tasks WHERE owner = ? AND id = ?').get(req.user.id, id))) return;
    if (!req.is_param_valid(order, true)) return;
    let i = 1;
    order.forEach((id) => {
        res.db.prepare(`UPDATE task_steps SET sort_pos = ? WHERE id = ? AND owner = ?`).run(i, id, req.user.id);
        i++;
    });
    res.out.task = getTask(res.db, id);
    res.json_end();
});

// Handle Discord login
srv.get('/discord-callback', (req, res) => {
    res.redirect(`/?discord_code=${req.query.get('code')}`);
});
srv.get('/discord-login', async(req, res) => {
    res.db = new sqlite3(dbPath);
    // Make sure a code is supplied
    const code = req.query.get('code');
    if (!code) return res.status(400).json({ error: 'missingCode' });
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
    let storedUser = res.db.prepare('SELECT * FROM users WHERE discord_id = ?').get(resUser.id);
    // Respond with an error if this Discord account isn't approved
    // and if it doesn't already exist in the database
    if (!credentials.allow_new_users && !storedUser) {
        const allowedIds = require('./allowedUsers.json');
        if (!allowedIds.includes(resUser.id.toString()))
            return res.status(403).json({ error: 'notApproved' });
    }
    // Save the current timestamp to use as a new user ID
    const newUserId = Date.now();
    // If the user doesn't exist
    if (!storedUser) {
        // Create a shiny new user in the database
        res.db.prepare('INSERT INTO users (id, discord_id, name, discriminator, picture) VALUES (?, ?, ?, ?, ?)').run(newUserId, resUser.id, resUser.username, resUser.discriminator, resUser.avatar);
        let storedUser = res.db.prepare(`SELECT * FROM users WHERE id = ?`).get(newUserId);
        // Add a new list and task for the user
        const listId = Date.now();
        res.db.prepare('INSERT INTO lists (id, owner, name, hue, count_pending) VALUES (?, ?, ?, ?, ?)').run(listId, newUserId, 'To-do', 200, 1);
        res.db.prepare('INSERT INTO tasks (id, list_id, owner, name, desc) VALUES (?, ?, ?, ?, ?)').run(Date.now(), listId, newUserId, 'Start using CyberTasks', `You can use this list as a space to see what CyberTasks has to offer!`);
        send_audit(storedUser, `signed in for the first time`);
    } else {
        // If they do exist, update their profile details to match Discord
        res.db.prepare('UPDATE users SET name = ?, discriminator = ?, picture = ? WHERE discord_id = ?').run(resUser.username, resUser.discriminator, resUser.avatar, resUser.id);
        send_audit(storedUser, `signed into a new device`);
    }
    // Generate a new token
    const token = randomHex(256);
    // Make a new token entry
    res.db.prepare('INSERT INTO auth (id, owner, token, last_seen, ua) VALUES (?, ?, ?, ?, ?)').run(Date.now(), storedUser.id || newUserId, token, Date.now(), req.ua);
    // Respond with the new token
    res.json({ token: token });
});

// Handle Discord server invite redirect
if (credentials.discord_invite) {
    srv.get('/discord', (req, res) => {
        res.redirect(credentials.discord_invite);
    });
}

const port = devConfig.port || 8726;
srv.listen(port, () => {
    console.log(`Listening on port ${port}`);
});