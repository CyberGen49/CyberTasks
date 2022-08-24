
const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');
const clc = require('cli-color');
const sqlite3 = require('better-sqlite3');
const fetch = require('node-fetch');
const mime = require('mime');
const getBodyJson = require('body/json');

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

const srv = http.createServer((req, res) => {
    let db = false;
    // Parse paths
    const reqPath = path.normalize(req.url.split('?')[0]);
    const reqPathSplit = reqPath.split('/').filter(String);
    // Parse query string params
    const params = new URLSearchParams(req.url.split('?')[1]);
    // Save user agent and IP
    const ua = req.headers['user-agent'] || false;
    const clientIp = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    // Sends the response when called
    const end = (data = null, code = 200) => {
        res.statusCode = code;
        res.end(data);
        if (db) db.close();
        // Log
        let codeC = clc.yellow(code);
        switch (code.toString().substring(0, 1)) {
            case '2': codeC = clc.green(code); break;
            case '3': codeC = clc.cyan(code); break;
            case '4': codeC = clc.redBright(code); break;
            case '5': codeC = clc.red(code); break;
        }
        console.log(clc.cyanBright(clientIp), clc.yellowBright(req.method), codeC, clc.greenBright(req.url));
    }
    // End the response with a redirect
    const end_redirect = (url = '/') => {
        res.setHeader('Location', url);
        return end('Redirecting...', 307);
    }
    // End the response with a file stream
    const end_file = (filePath) => {
        if (fs.existsSync(filePath)) {
            if (!fs.statSync(filePath).isDirectory()) {
                res.setHeader('Content-Type', mime.getType(filePath));
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);
                stream.on('close', end);
                stream.on('error', () => {
                    end('500 Internal Server Error', 500);
                });
            } else return end('403 Access Denied', 403);
        } else return end('404 Not Found', 404);
    }
    // End the response as a JSON object
    const end_api = (obj, code = undefined) => {
        res.setHeader('Content-Type', 'application/json');
        end(JSON.stringify(obj), code);
    };
    // Handle API calls
    const handle_api_call = (endpoint, postBody = {}) => {
        db = new sqlite3('./main.db');
        let out = { status: 'good' };
        // Respond with an error
        const return_error = (short, message, code) => {
            out.status = 'error';
            out.error = { code: short, message: message };
            end_api(out, code);
            return false;
        }
        // Check the request method
        const is_method_valid = (method) => {
            if (req.method !== method) {
                return return_error('invalidMethod', `This API endpoint only accepts ${method} requests.`, 405);
            } else return true;
        }
        // Check a param against conditions
        const is_param_valid = (param, isValid = false) => {
            if (!param || !isValid) {
                return return_error('badRequest', `One or more parameters are missing or invalid.`, 400);
            } else return true;
        }
        // Check if the access token supplied in the JSON body is valid
        // If so, return its owner ID
        const is_token_valid = () => {
            const tokenEntry = db.prepare('SELECT * FROM auth WHERE token = ?').get(postBody.token);
            if (postBody.token
                && tokenEntry
                && (Date.now()-tokenEntry.last_seen) < (1000*60*60*24*30)
            ) {
                db.prepare('UPDATE auth SET last_seen = ? WHERE token = ?').run(Date.now(), tokenEntry.token);
                return tokenEntry.owner;
            }
            return return_error('badToken', `Invalid or expired token.`, 401);
        };
        // Returns the active token user object if the token is valid
        const get_active_user = () => {
            const tokenOwnerId = is_token_valid();
            if (!tokenOwnerId) return false;
            return db.prepare('SELECT * FROM users WHERE id = ?').get(tokenOwnerId);
        };
        // If the post body is invalid, respond with an error
        if (!postBody) return return_error('badRequest', `The request body doesn't contain valid JSON.`, 400);
        // A function for every API endpoint
        const handle_endpoint = {
            'discordInfo': () => {
                if (!is_method_valid('GET')) return;
                const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
                out.client_id = credentials.client_id;
                out.redirect_url = credentials.redirect_url;
                return end_api(out);
            },
            'me': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                out.user = user;
                return end_api(out);
            },
            'me/sessions/end': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                db.prepare('DELETE FROM auth WHERE token = ? AND owner = ?').run(postBody.token, user.id);
                return end_api(out);
            },
            'lists': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                out.lists = db.prepare('SELECT * FROM lists WHERE owner = ?').all(user.id) || {};
                return end_api(out);
            },
            'lists/create': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const name = postBody.name;
                const hue = postBody.hue;
                if (!is_param_valid(name, (name.length > 0 && name.length < 64)))
                    return;
                if (!is_param_valid(hue, (hue >= 0 && hue <= 360))) return;
                id = Date.now();
                db.prepare('INSERT INTO lists (id, owner, name, hue) VALUES (?, ?, ?, ?)').run(id, user.id, name, hue);
                out.list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
                return end_api(out, 201);
            },
            'lists/edit': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const id = params.get('id');
                const name = postBody.name;
                const hue = postBody.hue;
                if (!is_param_valid(id, db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(user.id, id))) return;
                if (!is_param_valid(name, (name.length > 0 && name.length < 64)))
                    return;
                if (!is_param_valid(hue, (hue >= 0 && hue <= 360))) return;
                out.id = id;
                db.prepare(`UPDATE lists SET name = ?, hue = ? WHERE id = ? AND owner = ?`).run(name, hue, id, user.id);
                return end_api(out);
            },
            'lists/delete': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const id = params.get('id');
                if (!is_param_valid(id, db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(user.id, id))) return;
                db.prepare('DELETE FROM lists WHERE id = ? AND owner = ?').run(id, user.id);
                db.prepare('DELETE FROM tasks WHERE list_id = ? AND owner = ?').run(id, user.id);
                return end_api(out);
            },
            'tasks/create': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const listId = params.get('list');
                const name = postBody.name;
                if (!is_param_valid(listId, db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(user.id, listId))) return;
                if (!is_param_valid(name, (name.length > 0 && name.length < 256))) return;
                const id = Date.now();
                db.prepare('INSERT INTO tasks (id, list_id, owner, name) VALUES (?, ?, ?, ?)').run(id, listId, user.id, name);
                db.prepare('UPDATE lists SET count_pending = count_pending + 1 WHERE id = ?').run(listId);
                out.task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
                return end_api(out, 201);
            },
            'tasks/toggleComplete': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const taskId = params.get('id');
                const entry = db.prepare(`SELECT id, is_complete FROM tasks WHERE owner = ? AND id = ?`).get(user.id, taskId)
                if (!is_param_valid(taskId, entry)) return;
                const newCompletionStatus = (!entry.is_complete) ? 1 : 0;
                out.id = taskId;
                out.is_complete = newCompletionStatus;
                db.prepare('UPDATE tasks SET is_complete = ? WHERE id = ?').run(newCompletionStatus, taskId);
                db.prepare('UPDATE lists SET count_pending = count_pending - 1 WHERE id = ?').run(listId);
                db.prepare('UPDATE lists SET count_complete = count_complete + 1 WHERE id = ?').run(listId);
                return end_api(out);
            },
            'tasks/delete': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const taskId = params.get('id');
                if (!is_param_valid(taskId, db.prepare(`SELECT id FROM tasks WHERE owner = ? AND id = ?`).get(user.id, taskId))) return;
                db.prepare('DELETE FROM tasks WHERE owner = ? AND id = ?').run(user.id, taskId);
                db.prepare('UPDATE lists SET count_pending = count_pending - 1 WHERE id = ?').run(taskId);
                return end_api(out);
            },
            'tasks/pending': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const listId = params.get('list');
                if (!is_param_valid(listId, db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(user.id, listId))) return;
                out.tasks = db.prepare('SELECT * FROM tasks WHERE owner = ? AND list_id = ? AND is_complete = 0').all(user.id, listId) || {};
                return end_api(out);
            },
            'tasks/complete': () => {
                if (!is_method_valid('POST')) return;
                const user = get_active_user();
                if (!user) return;
                const listId = params.get('list');
                if (!is_param_valid(listId, db.prepare('SELECT id FROM lists WHERE owner = ? AND id = ?').get(user.id, listId))) return;
                out.tasks = db.prepare('SELECT * FROM tasks WHERE owner = ? AND list_id = ? AND is_complete = 1').all(user.id, listId) || {};
                return end_api(out);
            }
        }
        // If the requested endpoint exists, handle it
        if (handle_endpoint[endpoint])
            return handle_endpoint[endpoint]();
        // Otherwise, respond with an error
        else {
            out.status = 'error';
            out.error = { code: 'notFound', message: `The requested API endpoint doesn't exist.` };
            return end_api(out, 404);
        }
    };
    // Handle Discord authentication and account creation
    const handle_discord = async() => {
        db = new sqlite3('./main.db');
        // Make sure a code is supplied
        if (!params.get('code')) return end_api({ error: 'missingCode' }, 400);
        // Read client ID and secret from the credentials file
        const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
        // Fetch the user access code using the provided code
        const resAccess = await (await fetch(`https://discord.com/api/v10/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'client_id': credentials.client_id,
                'client_secret': credentials.client_secret,
                'grant_type': 'authorization_code',
                'code': params.get('code'),
                'redirect_uri': credentials.redirect_url
            })
        })).json();
        // Respond with an error if there's no access token
        if (!resAccess.access_token)
            return end_api({ error: 'authFailed' }, 401);
        // Use the new access token to fetch user info
        const resUser = await (await fetch(`https://discord.com/api/v10/users/@me`, {
            headers: { 'Authorization': `Bearer ${resAccess.access_token}` }
        })).json();
        // Respond with an error if there's no user info
        if (!resUser.id) 
            return end_api({ error: 'getUserFailed' }, 500);
        // Respond with an error if this Discord account isn't approved
        let approvedIds = [];
        if (!credentials.allow_new_users) {
            approvedIds = JSON.parse(fs.readFileSync('./allowedUsers.json', 'utf-8'));
            if (!approvedIds.includes(resUser.id.toString()))
                return end_api({ error: 'notApproved' }, 403);
        }
        // Get the user entry from the database if it exists
        const storedUser = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(resUser.id);
        // Save the current timestamp to use as a new user ID
        const newUserId = Date.now();
        // If the user doesn't exist
        if (!storedUser) {
            // Create a shiny new user in the database
            db.prepare('INSERT INTO users (id, discord_id, name, discriminator, picture) VALUES (?, ?, ?, ?, ?)').run(newUserId, resUser.id, resUser.username, resUser.discriminator, resUser.avatar);
            // Add a new list and task for the user
            const listId = Date.now();
            db.prepare('INSERT INTO lists (id, owner, name, hue, count_pending) VALUES (?, ?, ?, ?)').run(listId, newUserId, 'To-do', 200, 1);
            db.prepare('INSERT INTO tasks (id, list_id, owner, name, desc) VALUES (?, ?, ?, ?, ?)').run(Date.now(), listId, newUserId, 'Start using CyberTasks', `You can use this list as a space to see what CyberTasks has to offer!`);
        } else {
            // If they do exist, update their profile details to match Discord
            db.prepare('UPDATE users SET name = ?, discriminator = ?, picture = ? WHERE discord_id = ?').run(resUser.username, resUser.discriminator, resUser.avatar, resUser.id);
        }
        // Generate a new token
        const token = randomHex(256);
        // Make a new token entry
        db.prepare('INSERT INTO auth (id, owner, token, last_seen, ua) VALUES (?, ?, ?, ?, ?)').run(Date.now(), storedUser?.id || newUserId, token, Date.now(), ua);
        // Respond with the new token
        return end_api({ token: token });
    };
    // Process request
    try {
        switch (reqPathSplit[0]) {
            case 'assets':
                return end_file(path.join('./web/', reqPath));
            case 'worker.js':
                return end_file('./web/worker.js');
            case 'api':
                reqPathSplit.shift();
                const endpoint = reqPathSplit.join('/');
                if (req.method.match(/^(POST|PUT)$/)) {
                    return getBodyJson(req, res, (e, body) => {
                        if (e) body = null;
                        handle_api_call(endpoint, body);
                    });
                }
                return handle_api_call(endpoint);
            case 'discord-callback':
                return end_redirect(`/?discord_code=${params.get('code')}`);
            case 'discord-login':
                return handle_discord();
            default:
                return end_file('./web/app.html');
        }
    } catch (e) {
        end('500 Internal Server Error', 500);
    }
});
const port = 8726;
srv.on('listening', () => {
    console.log(`Listening on port ${port}`);
});
srv.listen(port);

process.on('uncaughtException', err => {
    console.error(err);
    db.close();
    process.exit(1);
});
