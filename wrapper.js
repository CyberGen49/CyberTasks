
process.chdir(__dirname);

const fs = require('fs');
const cp = require('child_process');
const Discord = require('discord.js');

const ansiRegex = ({onlyFirst = false} = {}) => {
	const pattern = [
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
	].join('|');
	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
const bot = new Discord.Client({ intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent
] });
let channel = false;
let logBuffer = [];
let lastMsg = false;
bot.once('ready', () => {
    console.log(`Discord bot is ready!`);
    channel = bot.channels.cache.get(credentials.log_channel);
    channel.send(`Wrapper started`);
    setInterval(async() => {
        if (logBuffer.length > 0) {
            const str = logBuffer.join('');
            logBuffer = [];
            if (!lastMsg || lastMsg.content.length > 1800) {
                lastMsg = await channel.send(`
                    \`\`\`${str}\`\`\`
                `);
            } else {
                let lastContent = lastMsg.content;
                lastContent = lastMsg.content.substring(3, lastContent.length-3);
                lastMsg = await lastMsg.edit(`
                    \`\`\`${lastContent+str}\`\`\`
                `);
            }
        }
    }, 2000);
    bot.on('messageCreate', async(msg) => {
        if (!msg.author.bot && msg.channelId == credentials.log_channel) {
            if (msg.content == 'r' && isServerRunning) {
                await channel.send(`Restarting server...`);
                srv.kill('SIGINT');
            }
        }
    });
});
if (credentials.bot_token) {
    bot.login(credentials.bot_token);
} else {
    console.log(`No bot token in credentials, logs won't be sent to Discord`);
}

let srv;
let isServerRunning = false;
const start = () => {
    srv = cp.spawn('node', ['./server.js']);
    ['stdout', 'stderr'].forEach((type) => {
        srv[type].on('data', async(data) => {
            const output = data.toString();
            process.stdout.write(output);
            logBuffer.push(output.replace(ansiRegex(), ''));
            if (channel) channel.sendTyping();
        });
    });
    srv.on('spawn', () => {
        isServerRunning = true;
        lastMsg = false;
        logBuffer = [];
    });
    srv.on('exit', () => {
        setTimeout(start, 1000);
    });
}
start();

process.on('SIGINT', async() => {
    console.log(`Exiting...`);
    if (isServerRunning) {
        await srv.kill('SIGINT');
        process.exit();
    }
});