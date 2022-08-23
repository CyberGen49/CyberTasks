
let user = {};
let token;
const baseTitle = document.title;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

window.addEventListener('load', async() => {
    // If a Discord access code is present
    let loginError;
    if (params['discord_code']) {
        // Send the code and get a user account token in return
        const res = await (await fetch(`/discord-login?code=${params['discord_code']}`)).json();
        if (res.error) loginError = res.error;
        if (res.token) localStorageObjSet('auth', { token: res.token });
    }
    // Get authentication details from localstorage
    const auth = localStorageObjGet('auth');
    // If a token is saved
    if (auth.token) {
        // Check its validity with the server
        const res = await (await fetch('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: auth.token })
        })).json();
        if (res.status == 'good') {
            user = res.user;
            token = auth.token;
            localStorageObjSet('user', user);
            _id('login').style.display = 'none';
            init();
        } else {
            localStorageWipe();
            _id('login').classList.add('loaded');
        }
    // Otherwise, show the login page
    } else {
        localStorageWipe();
        _id('login').classList.add('loaded');
    }
    // Handle login errors
    switch (loginError) {
        case 'missingCode':
            _id('login').insertAdjacentHTML('beforeend', `
                <small>The authentication process was cancelled.</small>
            `);
            break;
        case 'authFailed':
            _id('login').insertAdjacentHTML('beforeend', `
                <small>
                    Something went wrong while authenticating with Discord. Try again in a few minutes.
                </small>
            `);
            break;
        case 'getUserFailed':
            _id('login').insertAdjacentHTML('beforeend', `
                <small>
                    Failed to fetch the user data associated with your Discord account. Please try again.
                </small>
            `);
            break;
        case 'notApproved':
            _id('login').insertAdjacentHTML('beforeend', `
                <small>
                    Only approved Discord accounts are able to use CyberTasks at this time. Contact <b>Cyber#1000</b> on Discord using the account you want access granted to and we'll get you added.
                </small>
            `);
            break;
    }
    window.history.replaceState(null, '', '/');
});

async function call_api(endpoint, data = {}, method = 'POST') {
    Object.assign(data, { token: token });
    const res = await fetch(`/api/${endpoint}`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        showPopup(`Request failed`, `The request to API endpoint <b>${endpoint}</b> failed! Make sure you're connected to the internet, then try again.`, [{
            label: 'Refresh app',
            action: () => {
                window.location.reload();
            }
        }, {
            label: 'Okay',
            escape: true,
            primary: true
        }]);
        let json = {};
        try {
            json = await res.json();
        } catch(e) {}
        console.log(`Failed API response`, json, res);
        return false;
    }
    const json = await res.json();
    console.log(`API response from ${endpoint}:`, json);
    return json;
}

let listsById = {};
async function updateLists() {
    _id('lists').innerHTML = '';
    const res = await call_api('lists');
    if (!res) {
        _id('lists').innerHTML = `
            <div class="col gap-8 align-center">
                <span style="color: var(--danger)">Failed to load lists</span>
                <button class="btn small" onClick="updateLists()">
                    <div class="icon">refresh</div>
                    Try again
                </button>
            </div>
        `;
        return;
    }
    let lists = res.lists;
    lists.sort((a, b) => {
        return b.id-a.id;
    });
    lists.forEach((list) => {
        listsById[list.id] = list;
        const elId = randomHex();
        _id('lists').insertAdjacentHTML('beforeend', `
            <button id="${elId}" class="listEntry ${(list.hue) ? `changeColours`:''}" style="${(list.hue) ? `--fgHue: ${list.hue}`:''}" data-id="${list.id}" title="${list.name}<br><small><em>Right click for actions...</em></small>">
                <span class="label">${list.name}</span>
            </button>
        `);
        _id(elId).addEventListener('click', () => {
            changeActiveList(list);
            _id('sidebarDimming').click();
        });
        _id(elId).addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContext([{
                type: 'item',
                name: 'Edit list...',
                icon: 'edit',
                action: () => {
                    editList(list);
                }
            }, {
                type: 'item',
                name: 'Delete list...',
                icon: 'delete',
                action: () => {
                    showPopup(`Delete list`, `
                        <p>Are you sure you want to delete <b>${list.name}</b> and <b>all</b> of its associated tasks?</p>
                        <p style="color: var(--danger)">This action can't be undone!</p>
                    `, [{
                        label: 'No',
                        escape: true
                    }, {
                        label: 'Yes',
                        primary: true,
                        action: async() => {
                            const res = await call_api(`lists/delete?id=${list.id}`);
                            if (res.status == 'good') {
                                updateLists();
                            }
                        }
                    }])
                }
            }, { type: 'sep' }, {
                type: 'item',
                name: 'Copy list ID',
                icon: 'code',
                action: () => {
                    navigator.clipboard.writeText(list.id);
                }
            }]);
        });
    });
}

async function editList(list) {
    // ...
}

let changeListTimeout;
let activeList = { id: 0 };
async function changeActiveList(list, force = false, specialType = false) {
    if (activeList.id == list.id && !force) return;
    clearTimeout(changeListTimeout);
    _id('list').classList.remove('visible');
    _id('listScrollArea').scrollTop = 0;
    _id('tasks').classList.remove('visible');
    document.title = list.name;
    changeListTimeout = setTimeout(async() => {
        _id('listCont').classList.add('changeColours');
        _id('listCont').style.setProperty('--fgHue', list.hue);
        _id('topbarTitle').innerText = list.name;
        _id('listHeaderTitle').innerText = list.name;
        _id('tasks').innerHTML = '';
        _id('list').classList.add('visible');
        const res = await call_api(`tasks/pending?list=${list.id}`);
        if (!res) {
            _id('tasks').innerHTML = `
                <div class="col gap-8 align-center">
                    <span style="color: var(--danger)">Failed to load tasks</span>
                    <button class="btn small" onClick="updateLists()">
                        <div class="icon">refresh</div>
                        Try again
                    </button>
                </div>
            `;
            return;
        }
        activeList = list;
        if (res.tasks.length == 0) {
            _id('tasks').innerHTML = `
                <div class="empty col gap-8 align-center">
                    <div class="icon">check_circle</div>
                    <div class="title">You're all caught up!</div>
                    <div class="desc">Sit back and relax or add a new task below.</div>
                </div>
            `;
        }
        res.tasks.forEach((task) => {
            const id = randomHex();
            _id('tasks').insertAdjacentHTML('beforeend', `
                <button id="${id}" class="task">
                    <div id="${id}-radio" class="radio" tabindex="0" title="Mark task as complete"></div>
                    <div class="label">
                        <div class="name">${task.name}</div>
                        ${(task.desc) ? `<div class="desc">${task.desc}</div>`:''}
                    </div>
                </button>
            `);
            _id(id).addEventListener('click', () => {
                showPopup('Edit task', 'Coming soon™', [{
                    label: 'Done',
                    primary: true,
                    escape: true
                }]);
            });
            _id(id).addEventListener('contextmenu', () => {
                showContext([{

                }])
            });
            const onComplete = async() => {
                _id(id).style.display = 'none';
                const res = await call_api(`tasks/toggleComplete?id=${task.id}`);
                if (res)
                    _id(id).remove();
                else
                    _id(id).style.display = '';
            };
            _id(`${id}-radio`).addEventListener('click', (e) => {
                e.stopPropagation();
                onComplete();
            });
            _id(`${id}-radio`).addEventListener('keyup', (e) => {
                if (e.code == 'Space') {
                    e.stopPropagation();
                    onComplete();
                }
            });
        });
        _id('tasks').classList.add('visible');
        _id('listScrollArea').dispatchEvent(new Event('scroll'));
    }, 200);
}

// Run once login is successful
async function init() {
    // Update profile elements
    _id('avatar').src = `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.picture}.png?size=512`;
    _id('username').innerText = user.name;
    _id('discriminator').innerText = `#${user.discriminator}`;
    // Handle sign out button
    _id('signOut').addEventListener('click', () => {
        showPopup('Sign out?', `Are you sure you want to sign out? Any unsaved changes will be lost.`, [{
            label: 'No',
            escape: true
        }, {
            label: 'Yes',
            primary: true,
            action: async() => {
                showPopup(`Signing out`, `We're signing you out...`);
                await call_api('me/sessions/end');
                localStorageWipe();
                window.location.reload();
            }
        }]);
    });
    // Handle create list button
    _id('createList').addEventListener('click', () => {
        let hueCircles = [];
        const hues = [ 0, 25, 50, 110, 160, 200, 240, 280, 320 ]
        let tmp = [];
        hues.forEach((hue) => {
            tmp.push(`
                <button class="hueCircle changeColours" style="--fgHue: ${hue}" data-hue="${hue}"></button>
            `);
            if (tmp.length == 3) {
                hueCircles.push(`<div class="row gap-10">${tmp.join('')}</div>`);
                tmp = [];
            }
        });
        if (tmp.length > 0)
            hueCircles.push(`<div class="row gap-10">${tmp.join('')}</div>`);
        const createId = randomHex();
        const id = showPopup('New list', `
            <div class="col">
                <div class="row">
                    <div class="input labeled" style="width: 100%">
                        <label>List name</label>
                        <input id="newListName" class="textbox" type="text" autocomplete="off">
                    </div>
                </div>
                <div class="row justify-center gap-10">
                    ${hueCircles.join('')}
                </div>
            </div>
        `, [{
            label: 'Cancel',
            escape: true
        }, {
            label: 'Create',
            primary: true,
            disabled: true,
            id: createId,
            action: async() => {
                const res = await call_api('lists/create', {
                    name: _id('newListName').value,
                    hue: parseInt(_qs(`.hueCircle.selected`).dataset.hue)
                });
                if (res) updateLists();
            }
        }]);
        [..._class(`hueCircle`)].forEach((el) => {
            el.addEventListener('click', () => {
                [..._class('hueCircle')].forEach((circle) => {
                    circle.classList.remove('selected');
                });
                el.classList.add('selected');
                _id(id).classList.add('changeColours');
                _id(id).style.setProperty('--fgHue', el.dataset.hue);
            });
        });
        _class('hueCircle')[Math.round(Math.random()*(hueCircles.length-1))].click();
        _id('newListName').addEventListener('input', () => {
            const value = _id('newListName').value;
            _id(createId).disabled = true;
            if (value.length > 0 && value.length < 64 )
                _id(createId).disabled = false;
        });
        _id('newListName').focus();
    });
    // Handle list sort button
    _id('sortLists').addEventListener('click', () => {
        showPopup('Sort lists', `
            Coming soon!
        `, [{
            label: 'Done',
            primary: true,
            escape: true,
            action: () => {
                // ...
            }
        }]);
    });
    // Handle titlebar on scroll
    _id('listScrollArea').addEventListener('scroll', () => {
        const el = _id('listScrollArea');
        if (el.scrollTop > 50)
            _id('topbar').classList.add('scrolled');
        else
            _id('topbar').classList.remove('scrolled');
        const rect = el.getBoundingClientRect();
        if ((el.scrollHeight-(el.scrollTop+rect.height)) > 10)
            _id('addTaskCont').classList.add('scrolled');
        else
            _id('addTaskCont').classList.remove('scrolled');
    });
    // Handle the menu
    _id('menuOpen').addEventListener('click', () => {
        _id('sidebar').classList.add('visible');
        _id('sidebarDimming').classList.add('visible');
        escapeQueue.push(() => {
            _id('sidebarDimming').click();
        });
    });
    _id('sidebarDimming').addEventListener('click', () => {
        _id('sidebar').classList.remove('visible');
        _id('sidebarDimming').classList.remove('visible');
    });
    _id('menuClose').addEventListener('click', () => {
        _id('sidebarDimming').click();
    });
    // Handle adding tasks
    _id('inputNewTaskName').addEventListener('keydown', (e) => {
        if (e.code == 'Enter') {
            e.preventDefault();
            _id('addTask').click();
        }
    });
    _id('inputNewTaskName').addEventListener('input', () => {
        const value = _id('inputNewTaskName').innerText.replace(/(\r|\n)/g, '');
        if (value.length > 0 && value.length < 256)
            _id('addTask').disabled = false;
        else
            _id('addTask').disabled = true;
    });
    _id('addTask').addEventListener('click', async() => {
        const value = _id('inputNewTaskName').innerText;
        _id('addTask').disabled = true;
        _id('inputNewTaskName').innerText = '';
        const res = await call_api(`tasks/create?list=${activeList.id}`, {
            name: value
        });
        if (res.id) changeActiveList(activeList, true);
    });
    // Handle the edit list button
    _id('listEdit').addEventListener('click', async() => {
        editList(activeList);
    });
    // Handle window resizing
    window.addEventListener('resize', () => {
        _id('listScrollArea').dispatchEvent(new Event('scroll'));
    });
    // Handle window focus
    window.addEventListener('focus', () => {
        // Pull lists and current list tasks down from the server
    });
    // Fetch lists
    await updateLists();
    // Select the first list
    _class('listEntry', _id('lists'))[0].click();
    // Show the private beta notice
    if (!localStorageObjGet('seenBetaNotice')) {
        showPopup(`Hey`, `
            <p>Thanks for trying out CyberTasks!</p>
            <p>Keep in mind that this project is in a private beta stage and you've been granted special access to give it a test drive.</p>
            <p>Part of the reason this project isn't available to the public yet is due to of limited resources. There are no rate limits, but please be mindful of your usage. Don't abuse the platform by creating unnecessary amounts of lists or tasks, or by making excessive API calls. This kind of abuse will result in the revocation of your access.</p>
            <p>If you run into any bugs, or have features that you'd like to request, direct them to <b>Cyber#1000</b> on Discord.</p>
        `, [{
            label: 'Okay',
            primary: true,
            action: () => {
                localStorageObjSet('seenBetaNotice', true);
            }
        }]);
    }
}

// Register the service worker
(async() => {
    await navigator.serviceWorker.register('/worker.js');
})();