
let user = {};
let token;
const baseTitle = document.title;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

window.addEventListener('load', async() => {
    // If a Discord access code is present
    let loginError;
    if (params.get('discord_code')) {
        // Send the code and get a user account token in return
        const res = await (await fetch(`/discord-login?code=${params.get('discord_code')}`)).json();
        if (res.error) loginError = res.error;
        if (res.token) localStorageObjSet('auth', { token: res.token });
    }
    const showLoginPage = async() => {
        const res = await fetch('/api/discordInfo');
        const credentials = await res.json();
        _id('signInDiscord').href = `https://discord.com/api/oauth2/authorize?client_id=${credentials.client_id}&redirect_uri=${encodeURIComponent(credentials.redirect_url)}&response_type=code&scope=identify`;
        localStorageWipe();
        _id('login').classList.add('loaded');
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
        } else showLoginPage();
    // Otherwise, show the login page
    } else showLoginPage();
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

function showBanner(text, icon, timeout = 5000) {
    _id('banner').innerHTML = `
        ${(icon) ? `<div class="icon">${icon}</div>`:''}
        <div class="text">${text}</div>
    `;
    _id('banner').classList.add('visible');
    setTimeout(() => {
        _id('banner').classList.remove('visible');
    }, timeout);
}

async function copyText(text) {
    showBanner('Text copied to clipboard', 'content_copy');
    return navigator.clipboard.writeText(text);
}

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
            action: window.location.reload
        }, {
            label: 'Okay',
            escape: true,
            primary: true
        }]);
        let json = null;
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

let lists = [];
let listsById = (id) => {
    for (const list of lists) {
        if (list.id == id) return list;
    }
    return false;
}
async function updateLists(force = false) {
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
    const listsCombo = [...res.lists, ...res.folders];
    if (JSON.stringify(lists) !== JSON.stringify(listsCombo) || force) {
        lists = listsCombo;
        lists.sort((a, b) => {
            return b.id-a.id;
        });
        lists.sort((a, b) => {
            return a.sort_pos-b.sort_pos;
        });
        _id('lists').innerHTML = '';
        lists.forEach((list) => {
            const elId = randomHex();
            if (list.sort_order) {
                _id('lists').insertAdjacentHTML('beforeend', `
                    <button id="${elId}" class="listEntry ${(list.hue) ? `changeColours`:''}" style="${(list.hue) ? `--fgHue: ${list.hue}`:''}" data-id="${list.id}" title="${list.name}<br><small><em>Right click for actions...</em></small>">
                        <span class="label">${escapeHTML(list.name)}</span>
                        <div class="handle"></div>
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
                            }]);
                        }
                    }, { type: 'sep' }, {
                        type: 'item',
                        name: 'Copy list ID',
                        icon: 'code',
                        action: () => {
                            copyText(list.id);
                        }
                    }]);
                });
            } else {
                _id('lists').insertAdjacentHTML('beforeend', `
                    <div id="${elId}" class="listFolder row align-center no-wrap" data-id="${list.id}" title="${escapeHTML(list.name)} (Category)<br><small><em>Right click for actions...</em></small>">
                        <span class="label">${escapeHTML(list.name)}</span>
                        <div class="handle"></div>
                    </div>
                `);
                _id(elId).addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showContext([{
                        type: 'item',
                        name: 'Edit category...',
                        icon: 'edit',
                        action: () => {
                            editListFolder(list);
                        }
                    }, {
                        type: 'item',
                        name: 'Delete category...',
                        icon: 'delete',
                        action: () => {
                            showPopup(`Delete category`, `
                                <p>Are you sure you want to delete this category?</p>
                                <p>Your lists won't be effected.</p>
                            `, [{
                                label: 'No',
                                escape: true
                            }, {
                                label: 'Yes',
                                primary: true,
                                action: async() => {
                                    const res = await call_api(`lists/deleteFolder?id=${list.id}`);
                                    if (res.status == 'good') {
                                        updateLists();
                                    }
                                }
                            }]);
                        }
                    }, { type: 'sep' }, {
                        type: 'item',
                        name: 'Copy category ID',
                        icon: 'code',
                        action: () => {
                            copyText(list.id);
                        }
                    }]);
                });
            }
        });
    }
    return;
}

function showTask(task) {
    const id = randomHex();
    _id('tasks').insertAdjacentHTML('beforeend', `
        <button id="${id}" class="task" data-id="${task.id}" data-due="${task.due_date}">
            <div id="${id}-radio" class="radio" tabindex="0" title="Mark task as complete"></div>
            <div class="label">
                <div id="${id}-name" class="name"></div>
                ${(task.desc) ? `<div id="${id}-desc" class="desc"></div>`:''}
            </div>
        </button>
    `);
    _id(`${id}-name`).innerText = task.name;
    if (task.desc)
        _id(`${id}-desc`).innerText = task.desc;
    _id(id).addEventListener('click', () => {
        editTask(task);
    });
    _id(id).addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContext([{
            type: 'item',
            name: 'Edit task...',
            icon: 'edit',
            action: () => {
                editTask(task);
            }
        }, {
            type: 'item',
            name: 'Delete task...',
            icon: 'delete',
            action: () => {
                showPopup(`Delete task`, `
                    <p>Are you sure you want to delete this task?</p>
                    <p style="color: var(--danger)">This action can't be undone!</p>
                `, [{
                    label: 'No',
                    escape: true
                }, {
                    label: 'Yes',
                    primary: true,
                    action: async() => {
                        _id(id).style.display = 'none';
                        const res = await call_api(`tasks/delete?id=${task.id}`);
                        if (res.status == 'good') {
                            _id(id).remove();
                            if (activeTask.id == task.id) hideEditTask();
                        } else _id(id).style.display = '';
                    }
                }]);
            }
        }, {
            type: 'item',
            name: 'Move task...',
            icon: 'drive_file_move',
            action: () => {
                // ...
            }
        }, { type: 'sep' }, {
            type: 'item',
            name: 'Copy task ID',
            icon: 'code',
            action: () => {
                copyText(task.id);
            }
        }]);
    });
    const onComplete = async() => {
        _id(id).style.display = 'none';
        const res = await call_api(`tasks/toggleComplete?id=${task.id}`);
        if (res.status == 'good')
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
}
function sortTasks() {
    // https://stackoverflow.com/questions/34685316/reorder-html-elements-in-dom
    const wrapper = _id('tasks');
    const tasks = [...wrapper.children];
    const sort_func = {
        'created': (a, b) => {
            return parseInt(a.dataset.id)-parseInt(b.dataset.id);
        },
        'az': (a, b) => {
            const name = {
                a: _qs('.name', a).innerText,
                b: _qs('.name', b).innerText
            }
            return name.a.localeCompare(name.b, undefined, {
                numeric: true,
                sensitivity: 'base'
            });
        },
        'due': (a, b) => {
            a = parseInt(a.dataset.due) || 0;
            b = parseInt(b.dataset.due) || 0;
            return a-b;
        }
    }
    tasks.sort(sort_func[activeList.sort_order]);
    if (activeList.sort_reverse) tasks.reverse();
    tasks.forEach(task => {
        wrapper.appendChild(task);
    });
}

let changeListTimeout;
let activeList = { id: 0 };
let tasks = [];
const sortOrderNames = {
    'created-0': 'Created - Oldest to newest',
    'created-1': 'Created - Newest to oldest',
    'due-0': 'Due date - Closest to farthest',
    'due-1': 'Due date - Farthest to closest',
    'az-0': 'Alphabetically - A-Z',
    'az-1': 'Alphabetically - Z-A'
}
async function changeActiveList(list, force = false) {
    const isSameList = (activeList.id == list.id);
    clearTimeout(changeListTimeout);
    if (!isSameList) {
        _id('list').classList.remove('visible');
        _id('listScrollArea').scrollTop = 0;
        _id('tasks').classList.remove('visible');
        hideEditTask();
    }
    document.title = list.name;
    changeListTimeout = setTimeout(async() => {
        _id('listCont').classList.add('changeColours');
        _id('listCont').style.setProperty('--fgHue', list.hue);
        _id('topbarTitle').innerText = list.name;
        _id('listHeaderTitle').innerText = list.name;
        _id('taskSortText').innerText = sortOrderNames[`${list.sort_order}-${list.sort_reverse}`];
        _id('list').classList.add('visible');
        if (isSameList && !force) return;
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
        localStorageObjSet('activeList', activeList);
        if (res.tasks.length == 0) {
            _id('tasks').innerHTML = `
                <div class="empty col gap-8 align-center">
                    <div class="icon">check_circle</div>
                    <div class="title">You're all caught up!</div>
                    <div class="desc">Sit back and relax or add a new task below.</div>
                </div>
            `;
        } else if (JSON.stringify(tasks) !== JSON.stringify(res.tasks)) {
            _id('tasks').innerHTML = '';
            res.tasks.forEach((task) => {
                showTask(task);
                if (task.id == activeTask.id)
                    editTask(task, true);
            });
        }
        tasks = res.tasks;
        sortTasks();
        _id('tasks').classList.add('visible');
        _id('listScrollArea').dispatchEvent(new Event('scroll'));
    }, ((isSameList) ? 0 : 200));
}

function addHueCircles(el, parent) {
    let hueCircles = [];
    const hues = [ 0, 25, 50, 110, 160, 200, 240, 280, 320 ];
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
    el.insertAdjacentHTML('beforeend', hueCircles.join(''));
    [..._class(`hueCircle`)].forEach((el) => {
        el.addEventListener('click', () => {
            [..._class('hueCircle')].forEach((circle) => {
                circle.classList.remove('selected');
            });
            el.classList.add('selected');
            parent.classList.add('changeColours');
            parent.style.setProperty('--fgHue', el.dataset.hue);
        });
    });
}
function createList() {
    const createId = randomHex();
    const hueCircleContId = randomHex();
    const id = showPopup('New list', `
        <div class="col">
            <div class="row">
                <div class="input labeled" style="width: 100%">
                    <label>List name</label>
                    <input id="newListName" class="textbox" type="text" autocomplete="off">
                </div>
            </div>
            <div id="${hueCircleContId}" class="row justify-center gap-10"></div>
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
    addHueCircles(_id(hueCircleContId), _id(id));
    _class('hueCircle')[Math.round(Math.random()*(9-1))].click();
    _id('newListName').addEventListener('input', () => {
        const value = _id('newListName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64 )
            _id(createId).disabled = false;
    });
    _id('newListName').focus();
    _id(id).addEventListener('keypress', (e) => {
        if (e.code == 'Enter') _id(createId).click();
    });
}
function createListFolder() {
    const createId = randomHex();
    const id = showPopup('Add category', `
        <div class="input labeled" style="width: 300px">
            <label>Category name</label>
            <input id="newFolderName" class="textbox" type="text" autocomplete="off">
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
            const res = await call_api('lists/createFolder', {
                name: _id('newFolderName').value
            });
            if (res.status == 'good')
                updateLists();
        }
    }]);
    _id('newFolderName').addEventListener('input', () => {
        const value = _id('newFolderName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64)
            _id(createId).disabled = false;
    });
    _id('newFolderName').focus();
    _id(id).addEventListener('keypress', (e) => {
        if (e.code == 'Enter') _id(createId).click();
    });
}
function editList(list) {
    const doneId = randomHex();
    const hueCircleContId = randomHex();
    const id = showPopup(`Edit <span style="color: var(--f85)">${list.name}</span>`, `
        <div class="col">
            <div class="row">
                <div class="input labeled" style="width: 100%">
                    <label>List name</label>
                    <input id="listName" class="textbox" type="text" autocomplete="off">
                </div>
            </div>
            <div id="${hueCircleContId}" class="row justify-center gap-10"></div>
        </div>
    `, [{
        label: 'Cancel',
        escape: true
    }, {
        label: 'Save',
        primary: true,
        disabled: true,
        id: doneId,
        action: async() => {
            const res = await call_api(`lists/edit?id=${list.id}`, {
                name: _id('listName').value,
                hue: parseInt(_qs(`.hueCircle.selected`).dataset.hue)
            });
            if (res) {
                await updateLists();
                if (res.list.id == activeList.id) {
                    changeActiveList(res.list);
                }
            }
        }
    }]);
    addHueCircles(_id(hueCircleContId), _id(id));
    try {
        _qs(`.hueCircle[data-hue="${parseInt(list.hue)}"]`).click();
    } catch(e) {
        _class('hueCircle')[0].click();
    }
    _id('listName').addEventListener('input', () => {
        const value = _id('listName').value;
        _id(doneId).disabled = true;
        if (value.length > 0 && value.length < 64 )
            _id(doneId).disabled = false;
    });
    _id('listName').value = list.name;
    _id('listName').dispatchEvent(new Event('input'));
    _id('listName').focus();
    setTimeout(() => {
        _id('listName').selectionStart = _id('listName').value.length;
        _id('listName').selectionEnd = _id('listName').value.length;
    }, 50);
    _id(id).addEventListener('keypress', (e) => {
        if (e.code == 'Enter') _id(doneId).click();
    });
}
function editListFolder(folder) {
    const createId = randomHex();
    const id = showPopup('Edit category', `
        <div class="input labeled" style="width: 300px">
            <label>Category name</label>
            <input id="newFolderName" class="textbox" type="text" autocomplete="off">
        </div>
    `, [{
        label: 'Cancel',
        escape: true
    }, {
        label: 'Save',
        primary: true,
        disabled: true,
        id: createId,
        action: async() => {
            const res = await call_api(`lists/editFolder?id=${folder.id}`, {
                name: _id('newFolderName').value
            });
            if (res.status == 'good')
                updateLists();
        }
    }]);
    _id('newFolderName').addEventListener('input', () => {
        const value = _id('newFolderName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64)
            _id(createId).disabled = false;
    });
    _id('newFolderName').value = folder.name;
    _id('newFolderName').dispatchEvent(new Event('input'));
    _id('newFolderName').focus();
    _id(id).addEventListener('keypress', (e) => {
        if (e.code == 'Enter') _id(createId).click();
    });
}

let activeTask = { id: 0 };
let editTaskTransitionTimeout;
async function editTask(task, stayOpen = false) {
    if (task.id == activeTask.id && !stayOpen)
        return hideEditTask();
    activeTask = task;
    _id('editTaskName').innerText = task.name;
    clearTimeout(editTaskTransitionTimeout);
    _id('editTaskCont').classList.add('visible');
    editTaskTransitionTimeout = setTimeout(() => {
        _id('editTaskCont').classList.add('ani');
    }, 0);
}
function hideEditTask() {
    clearTimeout(editTaskTransitionTimeout);
    activeTask = { id: 0 };
    _id('editTaskCont').classList.remove('ani');
    editTaskTransitionTimeout = setTimeout(() => {
        _id('editTaskCont').classList.remove('visible');
    }, 200);
}

// Run once login is successful
async function init() {
    // Update profile elements
    _id('avatar').src = `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.picture}.png?size=512`;
    _id('username').innerText = user.name;
    _id('discriminator').innerText = `#${user.discriminator}`;
    // Add profile context menu
    _id('avatar').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContext([{
            type: 'item',
            name: 'Copy user ID',
            icon: 'code',
            action: () => {
                copyText(user.id);
            }
        }, {
            type: 'item',
            name: 'Copy access token...',
            icon: 'code',
            action: () => {
                showPopup(`Copy access token`, `
                    <p>Are you sure you want to copy your access token?</p>
                    <p style="color: var(--danger)">Your access token grants <b>full access</b> to your account, including all lists and tasks, active sessions, and account settings. <b>Never give this token to anyone.</b></p>
                `, [{
                    label: 'Cancel',
                    escape: true
                }, {
                    label: 'Copy',
                    primary: true,
                    action: () => {
                        copyText(token);
                    }
                }])
            }
        }]);
    });
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
    // Handle creating lists
    _id('createList').addEventListener('click', createList);
    _id('createListFolder').addEventListener('click', createListFolder);
    // Handle rearranging lists
    let is_reordering = false;
    _id('reoderLists').addEventListener('click', () => {
        if (!is_reordering) {
            _id('reoderLists').classList.remove('alt');
            _id('lists').classList.add('sortable');
        } else {
            _id('reoderLists').classList.add('alt');
            _id('lists').classList.remove('sortable');
        }
        is_reordering = !is_reordering;
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
    // Handle sorting tasks
    _id('sortTasks').addEventListener('click', () => {
        let data = [];
        Object.keys(sortOrderNames).forEach((key) => {
            const name = sortOrderNames[key];
            const keySplit = key.split('-');
            data.push({
                type: 'item',
                name: name,
                action: async() => {
                    const res = await call_api(`lists/sort?id=${activeList.id}&order=${keySplit[0]}&reverse=${(parseInt(keySplit[1])) ? 'true':'false'}`);
                    if (res.status === 'good') {
                        updateLists();
                        activeList.sort_order = keySplit[0];
                        activeList.sort_reverse = parseInt(keySplit[1]);
                        changeActiveList(activeList);
                        sortTasks();
                    }
                }
            });
        });
        showContext(data);
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
        if (res.status == 'good') {
            showTask(res.task);
            sortTasks();
            tasks.push(res.task);
        }
    });
    // Handle the edit list button
    _id('listEdit').addEventListener('click', () => {
        editList(activeList);
    });
    // Handle task editing
    _id('editTaskClose').addEventListener('click', hideEditTask);
    _id('editTaskCont').addEventListener('click', () => {
        if (_id('editTaskCont').getBoundingClientRect().x == 0)
            _id('editTaskClose').click();
    });
    escapeQueue.push(() => {
        _id('editTaskClose').click();
    });
    _id('editTaskCard').addEventListener('click', (e) => {
        e.stopPropagation();
    });
    let taskNameEditTimeout;
    _id('editTaskName').addEventListener('input', (e) => {
        if (e.code == 'Enter') {
            e.preventDefault();
            return false;
        }
        clearTimeout(taskNameEditTimeout);
        const task = JSON.parse(JSON.stringify(activeTask));
        const value = _id('editTaskName').innerText.replace(/\n/g, '').replace(/\r/g, '');
        if (value.length < 1 || value.length > 255) return;
        taskNameEditTimeout = setTimeout(async() => {
            const res = await call_api(`tasks/edit?id=${task.id}`, {
                name: value
            });
            if (res.status == 'good') {
                _qs(`.task[data-id="${task.id}"]`).remove();
                showTask(res.task);
                sortTasks();
                activeTask = res.task;
                for (let i = 0; i < tasks.length; i++) {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                }
            }
        }, 500);
    });
    // Handle window resizing
    window.addEventListener('resize', () => {
        _id('listScrollArea').dispatchEvent(new Event('scroll'));
    });
    // Handle refreshing
    const lastRefresh = {
        get: () => { return localStorageObjGet('lastRefresh').time },
        update: () => { localStorageObjSet('lastRefresh', { time: Date.now() }) }
    }
    const refresh = async() => {
        if (user.id) {
            lastRefresh.update();
            await updateLists();
            changeActiveList(listsById(activeList.id), true);
        }
    }
    lastRefresh.update();
    setInterval(() => {
        if ((Date.now()-lastRefresh.get()) > (1000*30) && document.visibilityState == 'visible') {
            refresh();
        }
    }, 1000);
    // Fetch lists
    await updateLists();
    const sortable = Sortable.create(_id('lists'), {
        handle: '.handle',
        animation: 200,
        easing: 'cubic-bezier(0.1, 0.3, 0.3, 1',
        onStart: () => {
            _id('lists').classList.add('dragging');
        },
        onChange: () => {
            navigator.vibrate(2);
        },
        onEnd: async() => {
            _id('lists').classList.remove('dragging');
            let ids = [];
            [..._id('lists').children].forEach((el) => {
                if (!ids.includes(el.dataset.id))
                    ids.push(el.dataset.id);
            });
            const res = await call_api('lists/sort', {
                order: ids
            });
        }
    });
    // Select the last active list or the top list
    const lastActiveList = localStorageObjGet('activeList');
    if (lists.length > 0)
        changeActiveList(listsById(lastActiveList.id) || lists[0]);
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