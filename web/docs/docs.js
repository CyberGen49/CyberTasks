
const data = [{
    name: 'Get user info',
    desc: `Returns information about the current user.`,
    endpoint: 'me',
    method: 'GET',
    scope: 'me',
    returns: [{
        name: 'user',
        type: 'user',
        desc: `The current user's user object.`
    }],
    requiresAuth: true
}, {
    name: 'Get lists',
    desc: `Returns all of the user's lists and categories.`,
    endpoint: 'lists',
    method: 'GET',
    scope: 'listsRead',
    returns: [{
        name: 'lists',
        type: 'list',
        array: true,
        desc: `An array of list objects.`
    }, {
        name: 'folders',
        type: 'folder',
        array: true,
        desc: `An array of list folder (category) objects.`
    }],
    requiresAuth: true
}, {
    name: 'Sort sidebar',
    desc: `Sorts the lists and tasks in the user's sidebar.`,
    endpoint: 'lists/sort',
    method: 'PUT',
    scope: 'listsEdit',
    post: [{
        name: 'order',
        type: 'int',
        array: true,
        desc: `An array of list and category IDs in the desired order. Ideally, fetch these IDs from <code>/api/lists</code> and re-order them.`
    }],
    requiresAuth: true
}, {
    name: 'Create list',
    desc: `Creates a new list.`,
    endpoint: 'lists/create',
    method: 'POST',
    scope: 'listsCreate',
    post: [{
        name: 'name',
        type: 'string',
        desc: `The name of the new list. Must be less than 128 characters in length.`
    }, {
        name: 'hue',
        type: 'int',
        desc: `The hue to use for this list's accent colour. Must be between 0 and 360.`
    }],
    returns: [{
        name: 'list',
        type: 'list',
        desc: `The newly created list object.`
    }],
    requiresAuth: true
}, {
    name: 'Create category',
    desc: `Creates a new sidebar category.`,
    endpoint: 'lists/folders/create',
    method: 'POST',
    scope: 'listsCreate',
    post: [{
        name: 'name',
        type: 'string',
        desc: `The label of the new category.`
    }],
    returns: [{
        name: 'folder',
        type: 'folder',
        desc: `The newly created folder object.`
    }],
    requiresAuth: true
}, {
    name: 'Edit list',
    desc: `Edits an existing list.`,
    endpoint: 'lists/<id>/edit',
    method: 'PUT',
    scope: 'listsEdit',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target list.`
    }],
    post: [{
        name: 'name',
        type: 'string',
        desc: `The new name of the list. Must be less than 128 characters in length.`
    }, {
        name: 'hue',
        type: 'int',
        desc: `The new hue to use for this list's accent colour. Must be between 0 and 360.`
    }],
    returns: [{
        name: 'list',
        type: 'list',
        desc: `The edited list object.`
    }],
    requiresAuth: true
}, {
    name: 'Edit category',
    desc: `Edit an existing sidebar category.`,
    endpoint: 'lists/folders/<id>/edit',
    method: 'PUT',
    scope: 'listsEdit',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target category.`
    }],
    post: [{
        name: 'name',
        type: 'string',
        desc: `The new label of the category.`
    }],
    returns: [{
        name: 'folder',
        type: 'folder',
        desc: `The edited folder object.`
    }],
    requiresAuth: true
}, {
    name: 'Delete list',
    desc: `Deletes an existing list and <b>all</b> of its associated tasks.`,
    endpoint: 'lists/<id>/delete',
    method: 'DELETE',
    scope: 'listsDelete',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target list.`
    }],
    requiresAuth: true
}, {
    name: 'Delete category',
    desc: `Delete an existing sidebar category.`,
    endpoint: 'lists/folders/<id>/delete',
    method: 'DELETE',
    scope: 'listsDelete',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target category.`
    }],
    requiresAuth: true
}, {
    name: 'Get pending tasks (single list)',
    desc: `Gets all pending (incomplete) tasks from a single list.`,
    endpoint: 'lists/<id>/tasks/pending',
    method: 'GET',
    scope: 'tasksRead',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target list.`
    }],
    returns: [{
        name: 'tasks',
        type: 'task',
        array: true,
        desc: `An array of task objects.`
    }],
    requiresAuth: true
}, {
    name: 'Get completed tasks (single list)',
    desc: `Gets all completed tasks from a single list.`,
    endpoint: 'lists/<id>/tasks/complete',
    method: 'GET',
    scope: 'tasksRead',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target list.`
    }],
    returns: [{
        name: 'tasks',
        type: 'task',
        array: true,
        desc: `An array of task objects.`
    }],
    requiresAuth: true
}, {
    name: 'Get upcoming tasks (global)',
    desc: `Gets all past due and upcoming tasks within a set number of days from all lists.`,
    endpoint: 'tasks/upcoming',
    method: 'GET',
    scope: 'tasksRead',
    query: [{
        name: 'days',
        type: 'int',
        desc: `The number of days that a task needs to be due in to be included in the response. Must be between <code>1</code> and <code>90</code>.`
    }],
    returns: [{
        name: 'tasks',
        type: 'task',
        array: true,
        desc: `An array of task objects.`
    }],
    requiresAuth: true
}, {
    name: 'Change list sort order',
    desc: `Changes the stored task sort order for a list. Sorting is up to the client.`,
    endpoint: 'lists/<id>/sort',
    method: 'put',
    scope: 'listsEdit',
    path: [{
        name: '<id>',
        type: 'int',
        desc: `The ID of the target list.`
    }],
    query: [{
        name: 'order',
        type: 'string',
        desc: `The new sort order. Possible values are <code>az</code>, <code>created</code>, or <code>due</code>.`
    }, {
        name: 'reverse',
        type: 'string',
        optional: true,
        desc: `If set to <code>true</code> (as a literal string), the sort order should be reversed.`
    }],
    returns: [{
        name: 'list',
        type: 'list',
        desc: `The edited list object.`
    }],
    requiresAuth: true
}];

data.forEach((entry) => {
    if (!entry.returns)
    entry.returns = [];
    entry.returns.unshift({
        name: 'success',
        type: 'bool',
        desc: `Whether or not the request was successful.`
    });
});

const types = {
    user: {
        name: 'User',
        desc: `Describes the attributes of a user.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The user's ID. This also functions as a creation timestamp.`
        }, {
            name: 'discord_id',
            type: 'string',
            desc: `The user's Discord snowflake.`
        }, {
            name: 'name',
            type: 'string',
            desc: `The user's Discord username.`
        }, {
            name: 'discriminator',
            type: 'int',
            desc: `The user's Discord username discriminator (the last 4 numbers).`
        }, {
            name: 'picture',
            type: 'string',
            desc: `The user's Discord avatar hash. <a href="https://discord.com/developers/docs/reference#image-formatting" target="_blank">Learn more</a>`
        }, {
            name: 'is_new',
            type: 'int',
            desc: `(Currently unused) If the user is new or not. Possible values are <code>0</code> or <code>1</code>.`
        }]
    },
    list: {
        name: 'List',
        desc: `Describes the attributes of a list.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The list's ID. This also functions as a creation timestamp.`
        }, {
            name: 'owner',
            type: 'int',
            desc: `The list owner's user ID.`
        }, {
            name: 'name',
            type: 'string',
            desc: `The list name.`
        }, {
            name: 'hue',
            type: 'int',
            desc: `This list's accent colour hue, from 0 to 360.`
        }, {
            name: 'sort_pos',
            type: 'int',
            desc: `This list's position in the user's sidebar. This number is 0 if the user has never sorted their lists.`
        }, {
            name: 'count_pending',
            type: 'int',
            desc: `The number of pending (incomplete) tasks in this list.`
        }, {
            name: 'count_complete',
            type: 'int',
            desc: `The number of complete tasks in this list.`
        }, {
            name: 'sort_order',
            type: 'string',
            desc: `The order in which this list's tasks should be sorted. Possible values are <code>az</code>, <code>created</code>, or <code>due</code>. Honouring this sort order is up to you.`
        }, {
            name: 'sort_reverse',
            type: 'int',
            desc: `If the order of the tasks in this list (as defined above) is to be reversed. Possible values are <code>0</code> or <code>1</code>.`
        }]
    },
    folder: {
        name: 'ListFolder',
        desc: `Describes the attributes of a list category.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The category's ID. This also functions as a creation timestamp.`
        }, {
            name: 'owner',
            type: 'int',
            desc: `The category owner's user ID.`
        }, {
            name: 'name',
            type: 'string',
            desc: `The category name.`
        }, {
            name: 'sort_pos',
            type: 'int',
            desc: `This category's position in the user's sidebar. This number is 0 if the user has never sorted their lists.`
        }]
    },
    task: {
        name: 'Task',
        desc: `Describes the attributes of a task.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The task's ID. This also functions as a creation timestamp.`
        }, {
            name: 'list_id',
            type: 'int',
            desc: `The ID of the list that this task belongs to.`
        }, {
            name: 'owner',
            type: 'int',
            desc: `The task owner's user ID.`
        }, {
            name: 'name',
            type: 'string',
            desc: `The task name/label.`
        }, {
            name: 'due_date',
            type: 'string',
            desc: `This task's due date, or <code>null</code> if the task has no due date. If a due date is set, it has a format of <code>YYYY-M-D</code>. For example, <code>2022-9-8</code> corresponds to September 8th, 2022.`
        }, {
            name: 'due_date_time',
            type: 'int',
            desc: `This task's due date in the form of a UNIX millisecond timestamp, or <code>0</code> if the task has no due date. This value is used primarily for sorting.`
        }, {
            name: 'desc',
            type: 'string',
            desc: `The task's notes, or <code>null</code> if none are set.`
        }, {
            name: 'is_complete',
            type: 'int',
            desc: `Whether or not the task is complete. Possible values are <code>0</code> or <code>1</code>.`
        }, {
            name: 'is_repeat',
            type: 'int',
            desc: `Whether or not the task is set to repeat. Possible values are <code>0</code> or <code>1</code>.`
        }, {
            name: 'repeat_unit',
            type: 'string',
            desc: `The unit of time that the task is set to repeat by, or <code>null</code> if not set. Possible values are <code>days</code>, <code>weeks</code>, <code>months</code>, or <code>years</code>.`
        }, {
            name: 'repeat_count',
            type: 'int',
            desc: `The number of units (as defined above) that the task is set to repeat by, or <code>null</code> if not set.`
        }, {
            name: 'steps',
            type: 'step',
            array: true,
            desc: `An array of task step objects.`
        }]
    },
    step: {
        name: 'TaskStep',
        desc: `Describes the attributes of a task step.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The step's ID. This also functions as a creation timestamp.`
        }, {
            name: 'task_id',
            type: 'int',
            desc: `The ID of the task that this step belongs to.`
        }, {
            name: 'owner',
            type: 'int',
            desc: `The task owner's user ID.`
        }, {
            name: 'name',
            type: 'string',
            desc: `The step name/label.`
        }, {
            name: 'is_complete',
            type: 'int',
            desc: `Whether or not the step is complete. Possible values are <code>0</code> or <code>1</code>.`
        }, {
            name: 'sort_pos',
            type: 'int',
            desc: `The position of this step in the task's step list. This number is 0 if the task's steps have never been sorted.`
        }]
    },
    string: {
        name: 'String',
        link: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String`
    },
    int: {
        name: 'Integer',
        link: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number`
    },
    bool: {
        name: 'Boolean',
        link: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean`
    }
};

window.addEventListener('load', () => {
    const insertParams = (bodyId, title, params) => {
        const paramsId = randomHex();
        _id(bodyId).insertAdjacentHTML('beforeend', `
            <div id="${paramsId}" class="col gap-10 params">
                ${(title) ? `<h5 style="margin-bottom: 0px">${title}</h5>`:''}
            </div>
        `);
        params.forEach((param) => {
            let type = param.type;
            let isLocalType = false;
            let typeId = '';
            if (types[param.type]) {
                const customType = types[param.type];
                typeId = randomHex();
                type = `<a id="${typeId}" href="${(customType.link) ? customType.link:`#type-${param.type}`}" ${(customType.link) ? `target="_blank"`:''}>${customType.name}${(param.array) ? '[]':''}</a>`;
                if (!customType.link) isLocalType = true;
            }
            _id(paramsId).insertAdjacentHTML('beforeend', `
                <p>
                    ${type} <code>${escapeHTML(param.name)}</code> — ${(param.optional) ? '(Optional)':''} ${param.desc}
                </p>
            `);
            if (isLocalType) {
                on(_id(typeId), 'click', () => {
                    _id(`type-${param.type}`).classList.add('visible');
                });
            }
        });
    }
    data.forEach((entry) => {
        entry.endpoint = escapeHTML(entry.endpoint);
        entry.endpoint = entry.endpoint.replace(/(&lt;.*?&gt;)/g, `<span class="changeColours" style="--fgHue: 120; color: var(--f80)">$1</span>`);
        console.log(entry.endpoint)
        const htmlMethodAndUrl = `
            ${(entry.requiresAuth) ? `<div class="methodTag auth no-shrink"></div>`:''}
            <div class="methodTag ${entry.method.toLowerCase()} no-shrink"></div>
            <span><code>https://tasks.simplecyber.org/api<span style="color: var(--f80)">/${entry.endpoint}</span></code></span>
        `;
        const bodyId = randomHex();
        _id('endpoints').insertAdjacentHTML('beforeend', `
            <div class="spoiler">
                <div class="head">
                    <div class="col gap-0">
                        <h3>${entry.name}</h3>
                        <div class="row gap-10 align-center onlyWhileClosed">${htmlMethodAndUrl}</div>
                        <div class="onlyWhileOpen" style="margin-top: -3px;">
                            <p>${entry.desc}</p>
                        </div>
                    </div>
                </div>
                <div id="${bodyId}" class="body col">
                    <div class="col gap-10">
                        <div class="row gap-10 align-center">${htmlMethodAndUrl}</div>
                        <p>Scope: <code>${entry.scope}</code></p>
                    </div>
                </div>
            </div>
        `);
        if (entry.path) {
            insertParams(bodyId, 'Path parameters', entry.path);
        }
        if (entry.query) {
            insertParams(bodyId, 'Query parameters', entry.query);
        }
        if (entry.post) {
            insertParams(bodyId, 'JSON body parameters', entry.post);
        }
        if (entry.returns) {
            insertParams(bodyId, 'Response', entry.returns);
        }
    });
    Object.keys(types).forEach((key) => {
        const entry = types[key];
        if (!entry.schema) return;
        const bodyId = randomHex();
        _id('types').insertAdjacentHTML('beforeend', `
            <div id="type-${key}" class="spoiler">
                <div class="head">
                    <div class="col gap-0">
                        <h3>${entry.name}</h3>
                        <div style="margin-top: -3px;">
                            <p>${entry.desc}</p>
                        </div>
                    </div>
                </div>
                <div id="${bodyId}" class="body col"></div>
            </div>
        `);
        insertParams(bodyId, '', entry.schema);
    });

    _id('jsExample').innerHTML = 
`// async/await can't be used in the global scope, so we need to create
// an "Immediately-Invoked Function Expression" to run our async code
(async() => {
    const res = await fetch(\`https://tasks.simplecyber.org/lists/1662783520983/edit\`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'CyberTasks-Key': '34081b18dab4fc91be3a3e0cde724f12'
        },
        body: JSON.stringify({
            name: 'Test List',
            hue: 200
        })
    });
    const json = await res.json();
    console.log(json);
    /*
    {
        success: true,
        list: {
            // See List data type below
        }
    }
    */
})();`;
    Prism.highlightAll();
});