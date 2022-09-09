
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

function dueDateDiff(date) {
    const today = new Date();
    const diff = today.getTime()-date.getTime();
    return diff;
}
function dueDateFormat(date) {
    const today = new Date();
    const diff = dueDateDiff(date);
    if (diff < 0 && diff > -(1000*60*60*24))
        return 'Tomorrow';
    if (diff > 0 && diff < (1000*60*60*24))
        return 'Today';
    if (diff > (1000*60*60*24) && diff < (1000*60*60*24*2))
        return 'Yesterday';
    if (date.getFullYear() !== today.getFullYear())
        return dayjs(date).format('ddd, MMM Do, YYYY');
    return dayjs(date).format('ddd, MMM Do');
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
        on(el, 'click', () => {
            [..._class('hueCircle')].forEach((circle) => {
                circle.classList.remove('selected');
            });
            el.classList.add('selected');
            parent.classList.add('changeColours');
            parent.style.setProperty('--fgHue', el.dataset.hue);
        });
    });
}

// Make a call to the API using the active user's access token
// Returns the response as decoded JSON
let callApiPopupTimeout;
async function call_api(endpoint, data = {}, method = 'POST') {
    Object.assign(data, { token: token });
    clearTimeout(callApiPopupTimeout);
    let popupId = false;
    callApiPopupTimeout = setTimeout(() => {
        popupId = showPopup(`Hang tight`, `Your request to the server is taking longer than expected...`);
    }, 1000);
    const res = await fetch(`/api/${endpoint}`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch((e) => {
        showPopup(`Request failed`, `A connection with the server couldn't be established. Make sure you're connected to the internet, then try again.`, [{
            label: 'Refresh app',
            action: window.location.reload
        }]);
    });
    clearTimeout(callApiPopupTimeout);
    if (popupId) hidePopup(popupId);
    if (!res.ok) {
        let json = null;
        try {
            json = await res.json();
        } catch(e) {}
        showPopup(`Request failed`, `
            <p>The request to API endpoint <b>${endpoint}</b> failed!</p>
            <p>${JSON.stringify(json)}</p>
        `, [{
            label: 'Refresh app',
            action: window.location.reload
        }, {
            label: 'Okay',
            escape: true,
            primary: true
        }]);
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
// Update the lists shown in the side panel
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
    const listsCombo = [{
        id: 'schedule',
        hue: 200,
        name: 'Scheduled tasks',
        sort_order: 'due',
        sort_reverse: 0
    }, ...res.lists, ...res.folders];
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
            if (list.id == 'schedule') return;
            const elId = randomHex();
            if (list.sort_order) {
                _id('lists').insertAdjacentHTML('beforeend', `
                    <button id="${elId}" class="listEntry ${(list.hue) ? `changeColours`:''}" style="${(list.hue) ? `--fgHue: ${list.hue}`:''}" data-id="${list.id}" title="${list.name}<br><small><em>Right click for actions...</em></small>">
                        <span class="label">${escapeHTML(list.name)}</span>
                        <div class="handle"></div>
                    </button>
                `);
                on(_id(elId), 'click', () => {
                    changeActiveList(list);
                    _id('sidebarDimming').click();
                });
                on(_id(elId), 'contextmenu', (e) => {
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
                            if (lists.length < 3) {
                                showPopup(`Unable to delete list`, `This is your only list! Create another list before deleting this one.`, [{
                                    label: 'Okay',
                                    escape: true,
                                    primary: true
                                }]);
                                return;
                            }
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
                                        await updateLists();
                                        changeActiveList(lists[1]);
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
                on(_id(elId), 'contextmenu', (e) => {
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
                                <p>Your lists won't be affected.</p>
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

// Render or re-render a task in the current list
function showTask(task) {
    const id = randomHex();
    const existingEl = _qs(`.task[data-id="${task.id}"]`);
    if (existingEl) existingEl.remove();
    if (!showCompleted && task.is_complete) return;
    if (activeList.id == 'schedule' && !task.due_date_time) return;
    let stats = [];
    if (task.due_date) {
        const diff = dueDateDiff(new Date(task.due_date));
        const dateText = dueDateFormat(new Date(task.due_date));
        stats.push(`
            <div class="dueDate row align-center gap-5 no-wrap ${dateText.toLowerCase()} ${(diff > 0) ? 'overdue':''}">
                <div>Due ${dateText}</div>
            </div>
        `);
    }
    if (task.steps.length > 0) {
        let count = { complete: 0, pending: 0 };
        task.steps.forEach((step) => {
            if (step.is_complete) count.complete++;
            else count.pending++;
        });
        stats.push(`
            <div class="steps row align-center gap-5 no-wrap ${(count.complete == task.steps.length) ? 'complete':''}" title="${count.complete} of ${task.steps.length} steps completed">
                <div>${count.complete} of ${task.steps.length}</div>
            </div>
        `);
    }
    _id((task.is_complete) ? 'tasksComplete':'tasks').insertAdjacentHTML('beforeend', `
        <button id="${id}" class="task ${(task.is_complete) ? 'complete':''}" data-id="${task.id}" data-due-time="${task.due_date_time}">
            <div id="${id}-radio" class="radio" tabindex="0" title="Mark task as ${(task.is_complete) ? 'in':''}complete"></div>
            <div class="label">
                ${(activeList.id == 'schedule') ? `<div class="desc changeColours" style="--fgHue: ${listsById(task.list_id).hue}; color: var(--f80)">
                    ${listsById(task.list_id).name}
                </div>`:''}
                <div id="${id}-name" class="name">${escapeHTML(task.name)}</div>
                ${(stats.length > 0) ? `
                    <div class="desc stats row gap-10">
                        ${stats.join('')}
                    </div>
                `:''}
                ${(task.desc) ? `<div id="${id}-desc" class="desc row" title="${escapeHTML(task.desc)}">${escapeHTML(task.desc)}</div>`:''}
            </div>
        </button>
    `);
    on(_id(id), 'click', () => {
        editTask(task);
    });
    on(_id(id), 'contextmenu', (e) => {
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
                showPopup(`Move task`, `Coming soon™`, [{
                    label: 'Okay',
                    primary: true,
                    escape: true
                }]);
            }
        }, {
            type: 'item',
            name: 'Duplicate task',
            icon: 'content_copy',
            action: async() => {
                showPopup(`Duplicate task`, `Coming soon™`, [{
                    label: 'Okay',
                    primary: true,
                    escape: true
                }]);
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
        if (res.status == 'good') {
            _id(id).remove();
            if (activeList.id != 'schedule') {
                activeList = res.list;
                showTask(res.task);
                changeActiveList(activeList);
            }
        } else _id(id).style.display = '';
    };
    on(_id(`${id}-radio`), 'click', (e) => {
        e.stopPropagation();
        onComplete();
    });
    on(_id(`${id}-radio`), 'keyup', (e) => {
        if (e.code == 'Space') {
            e.stopPropagation();
            onComplete();
        }
    });
}
// Sort tasks using the order defined in their list entry
function sortTasks() {
    // https://stackoverflow.com/questions/34685316/reorder-html-elements-in-dom
    const tasksCont = _id('tasks');
    const tasksCompleteCont = _id('tasksComplete');
    const tasks = [...tasksCont.children];
    const tasksComplete = [...tasksCompleteCont.children];
    const sort_func = {
        // Sort by creation date
        'created': (a, b) => {
            return parseInt(a.dataset.id)-parseInt(b.dataset.id);
        },
        // Sort alphabetically
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
        // Sort by due date
        // Make the date timestamp into a float, with the task's creation date
        // as the right side, so tasks with the same due date are still sorted
        // by creation date
        'due': (a, b) => {
            a = parseInt(a.dataset.dueTime) || new Date('9999-12-31').getTime();
            b = parseInt(b.dataset.dueTime) || new Date('9999-12-31').getTime();
            // a = parseFloat(`${a}.${a.dataset.id}`);
            // b = parseFloat(`${b}.${b.dataset.id}`);
            return a-b;
        }
    }
    // Sort pending tasks
    tasks.sort(sort_func[activeList.sort_order]);
    if (activeList.sort_reverse) tasks.reverse();
    tasks.forEach(task => {
        tasksCont.appendChild(task);
    });
    // Sort completed tasks
    tasksComplete.sort(sort_func[activeList.sort_order]);
    if (activeList.sort_reverse) tasksComplete.reverse();
    tasksComplete.forEach(task => {
        tasksCompleteCont.appendChild(task);
    });
    checkListEmpty();
}
// If the current list is empty, display some filler text
function checkListEmpty() {
    _id('tasksEmpty').style.display = 'none';
    _id('tasksEmptySchedule').style.display = 'none';
    if (_class('task', _id('tasks')).length == 0) {
        let id = 'tasksEmpty';
        if (activeList.id == 'schedule') id = 'tasksEmptySchedule';
        _id(id).style.display = '';
    }
    // Update the show completed button depending on whether
    // completed tasks are shown or not
    if (showCompleted) {
        _id('showCompletedText').innerText = `Hide completed tasks`;
        _id('showCompletedArrow').innerText = 'expand_less';
        _id('tasksComplete').style.display = '';
    } else {
        _id('showCompletedText').innerText = `Show ${activeList.count_complete} completed task`;
        if (activeList.count_complete !== 1)
            _id('showCompletedText').innerText += 's';
        _id('showCompletedArrow').innerText = 'expand_more';
        _id('tasksComplete').style.display = 'none';
    }
}

// Change the currently active list
let changeListTimeout;
let activeList = { id: 0 };
let tasks = [];
let showCompleted = false;
let lastSyncHour = '0';
const sortOrderNames = {
    'created-0': 'Created - Oldest to newest',
    'created-1': 'Created - Newest to oldest',
    'due-0': 'Due date - Closest to furthest',
    'due-1': 'Due date - furthest to closest',
    'az-0': 'Alphabetically - A-Z',
    'az-1': 'Alphabetically - Z-A'
}
function changeActiveList(list, force = false) {
    clearTimeout(changeListTimeout);
    // Force force if the current hour has changed
    // This is to make sure our relative due dates are up to date
    if (lastSyncHour !== dayjs().format('H')) {
        force = true;
        lastSyncHour = dayjs().format('H');
    }
    // If this is a list different than our current active one,
    // hide things while we fetch and render the new list
    const isSameList = (activeList.id == list.id);
    if (!isSameList) {
        _id('list').classList.remove('visible');
        _id('listScrollArea').scrollTop = 0;
        _id('tasks').classList.remove('visible');
        _id('tasksComplete').classList.remove('visible');
        _id('tasksEmpty').style.display = 'none';
        _id('showCompleted').style.display = 'none';
        hideEditTask();
    }
    // Update page title and active list variable
    document.title = list.name;
    activeList = list;
    localStorageObjSet('activeList', activeList);
    // Wait for animations to complete if needed
    changeListTimeout = setTimeout(async() => {
        // Update list display
        _id('listCont').classList.add('changeColours');
        _id('listCont').style.setProperty('--fgHue', list.hue);
        _id('topbarTitle').innerText = list.name;
        _id('listHeaderTitle').innerText = list.name;
        _id('taskSortText').innerText = sortOrderNames[`${list.sort_order}-${list.sort_reverse}`];
        // Show/hide some list elements conditionally
        _id('listEdit').style.display = '';
        _id('addTaskCont').style.display = '';
        _id('sortTasks').disabled = false;
        if (list.id == 'schedule') {
            _id('listEdit').style.display = 'none';
            _id('addTaskCont').style.display = 'none';
            _id('sortTasks').disabled = true;
        }
        // Make the list visible
        _id('list').classList.add('visible');
        // If this is the same list as before and we aren't forcing new
        // data to be fetched, finish up and stop here
        if (isSameList && !force) {
            _id('showCompleted').style.display = 'none';
            if (list.count_complete > 0) _id('showCompleted').style.display = '';
            checkListEmpty();
            sortTasks();
            return;
        }
        // Fetch and store pending tasks
        let resTasks = [];
        let mainUrl = `tasks/pending?list=${list.id}`;
        if (list.id == 'schedule') mainUrl = `tasks/upcoming?days=14`;
        const res = await call_api(mainUrl);
        if (!res.status == 'good') {
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
        resTasks = res.tasks;
        // If completed tasks are shown, fetch those and combine them with
        // the pending tasks
        if (showCompleted && list.id != 'schedule') {
            const res = await call_api(`tasks/complete?list=${list.id}`);
            if (!res.status == 'good') {
                _id('tasksComplete').innerHTML = `
                    <div class="col gap-8 align-center">
                        <span style="color: var(--danger)">Failed to load completed tasks</span>
                        <button class="btn small" onClick="updateLists()">
                            <div class="icon">refresh</div>
                            Try again
                        </button>
                    </div>
                `;
                return;
            }
            resTasks = [...resTasks, ...res.tasks];
        }
        // If the new set of tasks doesn't match the old set, or if
        // we're forcing new data to be rendered, render the tasks
        if (JSON.stringify(tasks) !== JSON.stringify(resTasks) || force) {
            _id('tasks').innerHTML = '';
            _id('tasksComplete').innerHTML = '';
            resTasks.forEach((task) => {
                showTask(task);
                if (task.id == activeTask.id)
                    editTask(task, true);
            });
        }
        tasks = resTasks;
        // Adjust for sorting and emptiness
        sortTasks();
        checkListEmpty();
        // Make the tasks visible
        _id('tasks').classList.add('visible');
        if (showCompleted) {
            setTimeout(() => {
                _id('tasksComplete').classList.add('visible');
            }, 0);
        }
        if (list.count_complete > 0) _id('showCompleted').style.display = '';
        _id('listScrollArea').dispatchEvent(new Event('scroll'));
    }, ((isSameList) ? 0 : 200));
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
    on(_id('newListName'), 'input', () => {
        const value = _id('newListName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64 )
            _id(createId).disabled = false;
    });
    _id('newListName').focus();
    on(_id(id), 'keypress', (e) => {
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
    on(_id('newFolderName'), 'input', () => {
        const value = _id('newFolderName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64)
            _id(createId).disabled = false;
    });
    _id('newFolderName').focus();
    on(_id(id), 'keypress', (e) => {
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
    on(_id('listName'), 'input', () => {
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
    on(_id(id), 'keypress', (e) => {
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
    on(_id('newFolderName'), 'input', () => {
        const value = _id('newFolderName').value;
        _id(createId).disabled = true;
        if (value.length > 0 && value.length < 64)
            _id(createId).disabled = false;
    });
    _id('newFolderName').value = folder.name;
    _id('newFolderName').dispatchEvent(new Event('input'));
    _id('newFolderName').focus();
    on(_id(id), 'keypress', (e) => {
        if (e.code == 'Enter') _id(createId).click();
    });
}

function editTaskCheckStepCount() {
    _id('addStep').disabled = false;
    if (activeTask.steps.length >= 32) {
        _id('addStep').disabled = true;
    }
}
let editTaskStepTimeouts = [];
function editTaskShowStep(step, focus = false) {
    const id = randomHex();
    _id('steps').insertAdjacentHTML('beforeend', `
        <div id="${id}" class="step row gap-8 align-center no-wrap" data-pos="${step.sort_pos || 0}">
            <div id="${id}-radio" class="radio no-shrink" title="Mark step as ${(step.is_complete) ? 'in':''}complete"></div>
            <div id="${id}-input" class="name flex-grow" placeholder="New step..." contenteditable></div>
            <button id="${id}-delete" class="btn small alt iconOnly noShadow delete no-shrink" title="Delete step">
                <div class="icon">close</div>
            </button>
            <div class="handle no-shrink"></div>
        </div>
    `);
    const el = _id(id);
    const elInput = _id(`${id}-input`);
    const elRadio = _id(`${id}-radio`);
    const elDel = _id(`${id}-delete`);
    if (step.id) el.dataset.id = step.id;
    if (step.name) elInput.innerText = step.name;
    if (step.is_complete) el.classList.add('complete');
    on(elInput, 'input', () => {
        clearTimeout(editTaskStepTimeouts[id]);
        const value = elInput.innerText.replace(/\n/g, '').replace(/\r/g, '').trim();
        const stepId = el.dataset.id;
        const task = JSON.parse(JSON.stringify(activeTask));
        editTaskStepTimeouts[id] = setTimeout(async() => {
            if (value.length < 1 || value.length > 127) return;
            let res = {};
            if (!stepId) {
                res = await call_api(`tasks/steps/create?task=${task.id}`, {
                    name: value
                });
                if (res.status == 'good') {
                    el.dataset.id = res.step.id;
                }
            } else {
                res = await call_api(`tasks/steps/edit?id=${stepId}`, {
                    name: value
                });
            }
            if (res.status == 'good') {
                showTask(res.task);
                sortTasks();
                activeTask = res.task;
                loop(tasks.length, (i) => {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                });
            }
        }, 500);
    });
    on(elInput, 'keyup', (e) => {
        if (e.code == 'Enter') _id('addStep').click();
    });
    on(elInput, 'blur', () => {
        const value = elInput.innerText.replace(/\n/g, '').replace(/\r/g, '').trim();
        if (!el.dataset.id && value.length == 0) {
            el.remove();
        } else {
            elInput.innerText = value;
        }
    });
    on(elDel, 'click', async() => {
        el.style.display = 'none';
        const res = await call_api(`tasks/steps/delete?id=${el.dataset.id}`);
        if (res.status == 'good') {
            el.remove();
            showTask(res.task);
            sortTasks();
            activeTask = res.task;
            loop(tasks.length, (i) => {
                if (tasks[i].id == activeTask.id)
                    tasks[i] = activeTask;
            });
        } else {
            el.style.display = '';
        }
    });
    const onComplete = async() => {
        if (el.dataset.id) {
            el.classList[
                (el.classList.contains('complete')) ? 'remove':'add'
            ]('complete');
        }
        const res = await call_api(`tasks/steps/toggleComplete?id=${el.dataset.id}`);
        if (res.status == 'good') {
            showTask(res.task);
            sortTasks();
            activeTask = res.task;
            loop(tasks.length, (i) => {
                if (tasks[i].id == activeTask.id)
                    tasks[i] = activeTask;
            });
        }
    }
    on(elRadio, 'click', onComplete);
    on(elRadio, 'keyup', (e) => {
        if (e.code == 'Space') onComplete();
    });
    editTaskCheckStepCount();
    if (focus) elInput.focus();
    return _id(id);
}
let activeTask = { id: 0 };
let editTaskTransitionTimeout;
async function editTask(task, stayOpen = false) {
    if (task.id == activeTask.id && !stayOpen)
        return hideEditTask();
    activeTask = task;
    _id('editTaskRadio').classList.remove('complete');
    if (_id('editTaskName').innerText !== task.name) {
        _id('editTaskName').blur();
        _id('editTaskName').innerText = task.name;
    }
    if (_id('editTaskDesc').innerText !== task.desc) {
        _id('editTaskDesc').blur();
        _id('editTaskDesc').innerText = task.desc || '';
    }
    _id('dueDateText').style.display = 'none';
    _id('removeDueDate').style.display = 'none';
    if (task.is_complete)
        _id('editTaskRadio').classList.add('complete');
    if (task.due_date) {
        _id('dueDateText').style.display = '';
        _id('removeDueDate').style.display = '';
        _id('dueDateText').innerText = dueDateFormat(new Date(task.due_date));
    }
    _id('steps').innerHTML = '';
    task.steps.sort((a, b) => {
        if (a.sort_pos == 0) a.sort_pos = Infinity;
        if (b.sort_pos == 0) b.sort_pos = Infinity;
        return a.sort_pos-b.sort_pos;
    });
    loopEach(task.steps, (step) => {
        editTaskShowStep(step);
    });
    clearTimeout(editTaskTransitionTimeout);
    _id('editTaskCont').classList.add('visible');
    editTaskTransitionTimeout = setTimeout(() => {
        _id('editTaskCont').classList.add('ani');
    }, 0);
    escapeQueue.push(() => {
        _id('editTaskClose').click();
    });
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
    dayjs.extend(dayjs_plugin_advancedFormat);
    // Update profile elements
    _id('avatar').src = `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.picture}.png?size=512`;
    _id('username').innerText = user.name;
    _id('discriminator').innerText = `#${user.discriminator}`;
    // Add profile context menu
    on(_id('avatar'), 'contextmenu', (e) => {
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
    on(_id('signOut'), 'click', () => {
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
    // Handle install prompt
    setInterval(() => {
        _id('installPrompt').style.scale = '0.9';
        setTimeout(() => {
            _id('installPrompt').style.scale = '1.2';
        }, 100);
        setTimeout(() => {
            _id('installPrompt').style.scale = '1';
        }, 300);
    }, 1000*10);
    _id('installPrompt').classList.add('hidden');
    // Handle creating lists
    on(_id('createList'), 'click', createList);
    on(_id('createListFolder'), 'click', createListFolder);
    // Handle rearranging lists
    let is_reordering = false;
    on(_id('reoderLists'), 'click', () => {
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
    on(_id('listScrollArea'), 'scroll', () => {
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
    on(_id('menuOpen'), 'click', () => {
        _id('sidebar').classList.add('visible');
        _id('sidebarDimming').classList.add('visible');
        escapeQueue.push(() => {
            _id('sidebarDimming').click();
        });
    });
    on(_id('sidebarDimming'), 'click', () => {
        _id('sidebar').classList.remove('visible');
        _id('sidebarDimming').classList.remove('visible');
    });
    on(_id('menuClose'), 'click', () => {
        _id('sidebarDimming').click();
    });
    // Handle showing the schedule list
    on(_id('listSchedule'), 'click', () => {
        changeActiveList(listsById('schedule'));
        _id('sidebarDimming').click();
    });
    // Handle sorting tasks
    on(_id('sortTasks'), 'click', () => {
        let data = [];
        Object.keys(sortOrderNames).forEach((key) => {
            const name = sortOrderNames[key];
            const keySplit = key.split('-');
            data.push({
                type: 'item',
                name: name,
                action: async() => {
                    const res = await call_api(`lists/sortTasks?id=${activeList.id}&order=${keySplit[0]}&reverse=${(parseInt(keySplit[1])) ? 'true':'false'}`);
                    if (res.status === 'good') {
                        updateLists();
                        activeList.sort_order = keySplit[0];
                        activeList.sort_reverse = parseInt(keySplit[1]);
                        changeActiveList(activeList);
                    }
                }
            });
        });
        showContext(data);
    });
    // Handle adding tasks
    on(_id('inputNewTaskName'), 'keydown', (e) => {
        if (e.code == 'Enter') {
            e.preventDefault();
            _id('addTask').click();
        }
    });
    on(_id('inputNewTaskName'), 'input', () => {
        const value = _id('inputNewTaskName').innerText.replace(/(\r|\n)/g, '');
        if (value.length > 0 && value.length < 256)
            _id('addTask').disabled = false;
        else
            _id('addTask').disabled = true;
    });
    on(_id('addTask'), 'click', async() => {
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
    on(_id('listEdit'), 'click', () => {
        editList(activeList);
    });
    // Handle showing/hiding completed tasks
    on(_id('showCompleted'), 'click', () => {
        showCompleted = !showCompleted;
        changeActiveList(activeList, true);
    });
    // Handle task editing
    on(_id('editTaskClose'), 'click', hideEditTask);
    on(_id('editTaskCont'), 'click', () => {
        if (_id('editTaskCont').getBoundingClientRect().x == 0)
            _id('editTaskClose').click();
    });
    on(_id('editTaskCard'), 'click', (e) => {
        e.stopPropagation();
    });
    let taskNameEditTimeout;
    on(_id('editTaskName'), 'input', (e) => {
        if (e.code == 'Enter') {
            return e.preventDefault();
        }
        clearTimeout(taskNameEditTimeout);
        const task = JSON.parse(JSON.stringify(activeTask));
        const value = _id('editTaskName').innerText.replace(/\n/g, '').replace(/\r/g, '').trim();
        if (value.length < 1 || value.length > 255) return;
        taskNameEditTimeout = setTimeout(async() => {
            const res = await call_api(`tasks/edit?id=${task.id}`, {
                name: value
            });
            if (res.status == 'good') {
                showTask(res.task);
                sortTasks();
                activeTask = res.task;
                loop(tasks.length, (i) => {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                });
            }
        }, 500);
    });
    on(_id('editTaskName'), 'paste', () => {
        _id('editTaskName').innerText = _id('editTaskName').innerText.replace(/\n/g, '').replace(/\r/g, '').trim();
    })
    on(_id('addStep'), 'click', () => {
        editTaskShowStep({}, true);
    });
    Sortable.create(_id('steps'), {
        handle: '.handle',
        animation: 200,
        easing: 'cubic-bezier(0.1, 0.3, 0.3, 1',
        onChange: () => {
            navigator.vibrate(2);
        },
        onEnd: async() => {
            let ids = [];
            [..._id('steps').children].forEach((el) => {
                const stepId = el.dataset.id;
                if (stepId && !ids.includes(stepId))
                    ids.push(stepId);
            });
            const res = await call_api(`tasks/steps/sort?task=${activeTask.id}`, {
                order: ids
            });
            if (res.status == 'good') {
                showTask(res.task);
                sortTasks();
                activeTask = res.task;
                loop(tasks.length, (i) => {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                });
            }
        }
    });
    on(_id('setDueDate'), 'click', () => {
        const task = JSON.parse(JSON.stringify(activeTask));
        selectDateTime(async(date) => {
            date = dayjs(date).format('YYYY-M-D');
            const res = await call_api(`tasks/edit?id=${task.id}`, {
                due_date: date
            });
            if (res.status == 'good') {
                activeTask = res.task;
                showTask(activeTask);
                sortTasks();
                editTask(activeTask, true);
                loop(tasks.length, (i) => {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                });
            }
        }, true, false, new Date(task.due_date));
    });
    on(_id('removeDueDate'), 'click', async() => {
        const task = JSON.parse(JSON.stringify(activeTask));
        const res = await call_api(`tasks/edit?id=${task.id}`, {
            due_date: 'null'
        });
        if (res.status == 'good') {
            activeTask = res.task;
            showTask(activeTask);
            sortTasks();
            editTask(activeTask, true);
            loop(tasks.length, (i) => {
                if (tasks[i].id == activeTask.id)
                    tasks[i] = activeTask;
            });
        }
    });
    let taskDescEditTimeout;
    on(_id('editTaskDesc'), 'input', (e) => {
        clearTimeout(taskDescEditTimeout);
        const task = JSON.parse(JSON.stringify(activeTask));
        const value = _id('editTaskDesc').innerText.trim();
        if (value.length == 0) _id('editTaskDesc').innerText = '';
        if (value.length > 2047) return;
        taskDescEditTimeout = setTimeout(async() => {
            const res = await call_api(`tasks/edit?id=${task.id}`, {
                desc: value
            });
            if (res.status == 'good') {
                showTask(res.task);
                sortTasks();
                activeTask = res.task;
                loop(tasks.length, (i) => {
                    if (tasks[i].id == activeTask.id)
                        tasks[i] = activeTask;
                });
            }
        }, 500);
    });
    // Handle window resizing
    on(window, 'resize', () => {
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
    Sortable.create(_id('lists'), {
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
        changeActiveList(listsById(lastActiveList.id) || lists[1]);
    // Show the private beta notice
    if (!localStorageObjGet('seenBetaNotice')) {
        showPopup(`Hey`, `
            <p>Thanks for trying out CyberTasks!</p>
            <p>Keep in mind that this project is in a private beta stage and you've been granted special access to give it a test drive.</p>
            <p>Part of the reason this project isn't available to the public yet is due to of limited resources. There are no rate limits, but please be mindful of your usage. Don't abuse the platform by creating unnecessary amounts of lists or tasks, or by making excessive API calls. This kind of abuse will result in the revocation of your access.</p>
            <p>CyberTasks is under active development, so things could change or disappear at any time. Development happens live on this server, so there could also be spans of time where things aren't working properly.</p>
            <p>If you run into any bugs, or have features that you'd like to request, direct them to <b>@Cyber#1000</b> on Discord.</p>
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