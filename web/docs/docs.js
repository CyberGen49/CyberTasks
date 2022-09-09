
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
}];

data.forEach((entry) => {
    if (entry.returns) {
        entry.returns.unshift({
            name: 'success',
            type: 'bool',
            desc: `Whether or not the request was successful.`
        });
    }
});

const types = {
    list: {
        name: 'List',
        desc: `Describes the attributes of a list.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The list's ID.`
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
            desc: `The order in which this list's tasks should be sorted. Possible values are <code>az</code>, <code>created</code>, or <code>due</code>.`
        }, {
            name: 'sort_reverse',
            type: 'int',
            desc: `If the order of the tasks in this list (as defined above) is to be reversed. Possible values are <code>0</code> or <code>1</code>.`
        }]
    },
    user: {
        name: 'User',
        desc: `Describes the attributes of a user.`,
        schema: [{
            name: 'id',
            type: 'int',
            desc: `The user's ID.`
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
            <div id="${paramsId}" class="col gap-8 params">
                ${(title) ? `<h5 style="margin-bottom: 0px">${title}</h5>`:''}
            </div>
        `);
        params.forEach((param) => {
            let type = param.type;
            if (types[param.type]) {
                const customType = types[param.type];
                const typeId = randomHex();
                type = `<a id="${typeId}" href="${(customType.link) ? customType.link : `#type-${param.type}`}" ${(customType.link) ? `target="_blank"`:''}>${customType.name}</a>`;
            }
            _id(paramsId).insertAdjacentHTML('beforeend', `
                <div class="row gap-8 no-wrap align-center">
                    <div class="row gap-5 no-wrap align-center">
                        <span>${type}</span>
                        <code>${param.name}</code>
                    </div>
                    —
                    <p>${param.desc}</p>
                </div>
            `);
        });
    }
    data.forEach((entry) => {
        const htmlMethodAndUrl = `
            ${(entry.requiresAuth) ? `<div class="methodTag auth no-shrink"></div>`:''}
            <div class="methodTag ${entry.method.toLowerCase()} no-shrink"></div>
            <code>https://tasks.simplecyber.org/api<span style="color: var(--f80)">/${entry.endpoint}</span></code>
        `;
        const bodyId = randomHex();
        _id('endpoints').insertAdjacentHTML('beforeend', `
            <div class="spoiler">
                <div class="head">
                    <div class="col gap-0">
                        <h3>${entry.name}</h3>
                        <div class="row gap-10 no-wrap align-center onlyWhileClosed">${htmlMethodAndUrl}</div>
                        <div class="onlyWhileOpen" style="margin-bottom: 3px;">
                            ${entry.desc}
                        </div>
                    </div>
                </div>
                <div id="${bodyId}" class="body col">
                    <div class="row gap-10 no-wrap align-center">${htmlMethodAndUrl}</div>
                </div>
            </div>
        `);
        if (entry.get) {
            insertParams(bodyId, 'Query parameters', entry.get);
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
                        <span style="margin-bottom: 3px;">${entry.desc}</span>
                    </div>
                </div>
                <div id="${bodyId}" class="body col"></div>
            </div>
        `);
        insertParams(bodyId, '', entry.schema);
    });
});