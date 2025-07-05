
import * as fs from 'node:fs/promises';
import {existsSync as exists} from 'node:fs';
import * as t from '@babel/types';
import {parseExpression} from '@babel/parser';
import {Client, GatewayIntentBits, Message} from 'discord.js';


function wrap(func: (x: any) => any): (x: any) => any {
    return x => func(Number(x));
}

function wrap2(func: (x: any, y: any) => any): (x: any, y: any) => any {
    return (x, y) => func(Number(x), Number(y));
}

function wrapn(func: (...args: any[]) => any): (...args: any[]) => any {
    return (...args: any[]) => func(...args.map(Number));
}

let scope = new Map<string, undefined | boolean | number | string | bigint | Function>();
scope.set('undefined', undefined);
scope.set('Infinity', Infinity);
scope.set('NaN', NaN);
scope.set('isNaN', Number.isNaN);
scope.set('Boolean', Boolean);
scope.set('Number', Number);
scope.set('String', String);
scope.set('BigInt', BigInt);
scope.set('e', Math.E);
scope.set('pi', Math.PI);
scope.set('π', Math.PI);
scope.set('abs', (x: any) => typeof x === 'bigint' ? (x < 0 ? -x : x) : Math.abs(x));
scope.set('floor', (x: any) => typeof x === 'bigint' ? x : Math.floor(x));
scope.set('ceil', (x: any) => typeof x === 'bigint' ? x : Math.ceil(x));
scope.set('sqrt', wrap(Math.sqrt));
scope.set('cbrt', wrap(Math.cbrt));
scope.set('pow', wrap2(Math.pow));
scope.set('exp', wrap(Math.exp));
scope.set('expm1', wrap(Math.expm1));
scope.set('clz32', wrap(Math.clz32));
scope.set('fround', wrap(Math.fround));
scope.set('f16round', wrap(Math.f16round));
scope.set('hypot', wrap2(Math.hypot));
scope.set('imul', wrap2(Math.imul));
scope.set('log', wrap(Math.log));
scope.set('ln', scope.get('log'));
scope.set('log10', wrap(Math.log10));
scope.set('log1p', wrap(Math.log1p));
scope.set('ln1p', scope.get('log1p'));
scope.set('log2', wrap(Math.log2));
scope.set('max', wrapn(Math.max));
scope.set('min', wrapn(Math.min));
scope.set('random', Math.random);
scope.set('round', (x: any, ndigits: any) => {
    if (typeof x === 'bigint') {
        return x;
    } else if (!ndigits) {
        return Math.round(x);
    } else {
        if (typeof ndigits === 'bigint') {
            ndigits = Number(ndigits);
        }
        let mul = 10 ** ndigits;
        return Math.round(x * mul) / mul;
    }
});
scope.set('sign', (x: any) => typeof x === 'bigint' ? (x < 0) : Math.sign(x));
scope.set('trunc', (x: any, ndigits: any) => {
    if (typeof x === 'bigint') {
        return x;
    } else if (!ndigits) {
        return Math.trunc(x);
    } else {
        if (typeof ndigits === 'bigint') {
            ndigits = Number(ndigits);
        }
        let mul = 10 ** ndigits;
        return Math.trunc(x * mul) / mul;
    }
});
scope.set('sin', wrap(Math.sin));
scope.set('cos', wrap(Math.cos));
scope.set('tan', Math.tan);
scope.set('cot', wrap(x => 1/Math.tan(x)));
scope.set('sec', wrap(x => 1/Math.cos(x)));
scope.set('csc', wrap(x => 1/Math.sin(x)));
scope.set('asin', wrap(Math.asin));
scope.set('acos', wrap(Math.acos));
scope.set('atan', Math.atan);
scope.set('atan2', Math.atan2);
scope.set('acot', wrap(x => Math.atan(1/x)));
scope.set('acot2', wrap2((y, x) => Math.atan2(x, y)));
scope.set('asec', wrap(x => Math.acos(1/x)));
scope.set('acsc', wrap(x => Math.asin(1/x)));
scope.set('arcsin', scope.get('asin'));
scope.set('arccos', scope.get('acos'));
scope.set('arctan', scope.get('atan'));
scope.set('arctan2', scope.get('atan2'));
scope.set('arccot', scope.get('acot'));
scope.set('arccot2', scope.get('acot2'));
scope.set('arcsec', scope.get('asec'));
scope.set('arccsc', scope.get('acsc'));
scope.set('sinh', wrap(Math.sin));
scope.set('cosh', wrap(Math.cos));
scope.set('tanh', Math.tan);
scope.set('coth', wrap(x => 1/Math.tan(x)));
scope.set('sech', wrap(x => 1/Math.cos(x)));
scope.set('csch', wrap(x => 1/Math.sin(x)));
scope.set('asinh', wrap(Math.asin));
scope.set('acosh', wrap(Math.acos));
scope.set('atanh', Math.atan);
scope.set('acoth', wrap(x => Math.atan(1/x)));
scope.set('asech', wrap(x => Math.acos(1/x)));
scope.set('acsch', wrap(x => Math.asin(1/x)));
scope.set('arcsinh', scope.get('asinh'));
scope.set('arccosh', scope.get('acosh'));
scope.set('arctanh', scope.get('atanh'));
scope.set('arccoth', scope.get('acoth'));
scope.set('arcsech', scope.get('asech'));
scope.set('arccsch', scope.get('acsch'));

function _evaluate(node: t.Expression): undefined | null | boolean | number | string | bigint | Function {
    switch (node.type) {
        case 'Identifier':
            if (node.name === 'undefined') {
                return undefined;
            }
            let out = scope.get(node.name);
            if (out === undefined) {
                throw new ReferenceError(`${node.name} is not defined`);
            }
            return out;
        case 'NullLiteral':
            return null;
        case 'StringLiteral':
        case 'BooleanLiteral':
        case 'NumericLiteral':
            return node.value;
        case 'UnaryExpression':
            let arg: any = _evaluate(node.argument);
            switch (node.operator) {
                case '-':
                    return -arg;
                case '+':
                    return +arg;
                case '!':
                    return !arg;
                case '~':
                    return ~arg;
                case 'typeof':
                    return typeof arg;
                case 'void':
                    return void arg;
                default:
                    throw new Error(`The unary ${node.operator} operator is not supported`);
            }
        case 'BinaryExpression':
            if (node.left.type === 'PrivateName') {
                throw new Error('Private names are not supported');
            }
            let left: any = _evaluate(node.left);
            let right: any = _evaluate(node.right);
            switch (node.operator) {
                case '+':
                    return left + right;
                case '-':
                    return left - right;
                case '*':
                    return left * right;
                case '/':
                    return left / right;
                case '%':
                    return left % right;
                case '**':
                    return left ** right;
                case '&':
                    return left & right;
                case '|':
                    return left | right;
                case '^':
                    return left ^ right;
                case '>>':
                    return left >> right;
                case '>>>':
                    return left >>> right;
                case '<<':
                    return left << right;
                case '==':
                    return left == right;
                case '===':
                    return left === right;
                case '!=':
                    return left != right;
                case '!==':
                    return left !== right;
                case '<':
                    return left < right;
                case '<=':
                    return left <= right;
                case '>':
                    return left > right;
                case '>=':
                    return left >= right;
                default:
                    throw new Error(`The binary ${node.operator} operator is not supported`);
            }
        case 'LogicalExpression':
            left = _evaluate(node.left);
            right = _evaluate(node.right);
            if (node.operator === '&&') {
                return left && right;
            } else if (node.operator === '||') {
                return left || right;
            } else {
                return left ?? right;
            }
        case 'CallExpression':
        case 'OptionalCallExpression':
            if (node.callee.type === 'V8IntrinsicIdentifier') {
                throw new Error(`${node.callee.name} is not defined`);
            }
            let value = _evaluate(node.callee) as unknown;
            if (typeof value !== 'function') {
                if (value === undefined || value === null) {
                    return value;
                } else {
                    throw new Error(`${value} is not a function`);
                }
            }
            return value(...node.arguments.map(arg => {
                if (arg.type === 'SpreadElement' || arg.type === 'ArgumentPlaceholder') {
                    throw new Error(`${arg.type}s are not supported`);
                }
                return _evaluate(arg);
            }));
        case 'ParenthesizedExpression':
            return _evaluate(node.expression);
        default:
            throw new Error(`${node.type}s are not supported`);
    }
}

function evaluate(msg: string): bigint {
    let value = _evaluate(parseExpression(msg) as t.Expression);
    if (value === undefined || value === null) {
        return 0n;
    } else if (typeof value === 'boolean') {
        return value ? 1n : 0n;
    } else if (typeof value === 'number') {
        return BigInt(Math.round(value));
    } else if (typeof value === 'string') {
        if (value.match(/^-?[0-9]+$/)) {
            return BigInt(value);
        } else {
            return BigInt(Math.round(Number(value)));
        }
    } else if (typeof value === 'function') {
        return BigInt(value.toString());
    } else {
        return value;
    }
}


interface Config {
    token: string;
    channel: string;
}

let config = JSON.parse((await fs.readFile('config.json')).toString()) as Config;


interface Stats {
    seqs: {[key: string]: number};
    users: {[key: string]: number};
    total: number;
    high: number;
    numbers: {[key: string]: number};
}

let stats: Stats;
if (exists('stats.json')) {
    stats = JSON.parse((await fs.readFile('stats.json')).toString());
} else {
    stats = {
        seqs: {},
        users: {},
        total: 0,
        high: 0,
        numbers: {},
    };
}

setInterval(async () => {
    fs.writeFile('stats.json', JSON.stringify(stats));
}, 5000);



let currentCount: bigint[] = [];

interface Sequence {
    id: string;
    name: string;
    elements: bigint[];
}

let previousSeq: Sequence | null = null;
let previousUser: string = '';

let seqList: Sequence[] = [];
let seqCache = new Map<string, Sequence>();

async function loadSequence(id: string): Promise<Sequence> {
    if (seqCache.has(id)) {
        return seqCache.get(id) as Sequence;
    }
    let data = (await fs.readFile(`${import.meta.dirname}/data/seq/${id.slice(0, 4)}/${id}.seq`)).toString();
    let name = '<no name provided>';
    let elements: bigint[] = [];
    for (let row of data.split('\n')) {
        let parts = row.split(' ');
        let type = parts[0][1];
        let data = parts.slice(2).join(' ');
        if (type === 'S' || type === 'T' || type === 'U') {
            elements.push(...data.split(',').map(BigInt));
        } else if (type === 'N') {
            name = data;
            if (name.endsWith('.')) {
                name = name.slice(0, -1);
            }
        }
    }
    let out: Sequence = {id, name, elements};
    seqCache.set(id, out);
    seqList.push(out);
    return out;
}

for (let i = 1; i < 10000; i++) {
    await loadSequence('A' + i.toString().padStart(6, '0'));
}

function findSequence(counts: bigint[]): {seq: Sequence | null, ranOut: boolean} {
    let backup: Sequence | null = null;
    for (let seq of seqList) {
        let error = false;
        for (let i = 0; i < counts.length; i++) {
            if (seq.elements[i] === undefined && (!backup || backup.elements.length < seq.elements.length)) {
                backup = seq;
            }
            if (seq.elements[i] !== counts[i]) {
                error = true;
                break;
            }
        }
        if (!error) {
            return {seq, ranOut: false};
        }
    }
    if (backup) {
        return {seq: backup, ranOut: true};
    } else {
        return {seq: null, ranOut: false};
    }
}


let client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});

client.once('ready', readyClient => {
	console.log(`logged in as ${readyClient.user.tag}`);
});

async function fail(message: Message, msg: string, react: boolean = true) {
    if (previousSeq) {
        let seq = previousSeq.id;
        if (seq in stats.seqs) {
            stats.seqs[seq]++;
        } else {
            stats.seqs[seq] = 1;
        }
    }
    currentCount = [];
    previousSeq = null;
    previousUser = '';
    if (react) {
        await message.react('❌');
    }
    await message.reply(msg);
}

async function success(message: Message) {
    let user = message.author.id;
    if (user === previousUser) {
        await fail(message, 'You broke the chain! You can\'t count two times in a row!');
        return;
    } else {
        await message.react('✅');
        previousUser = message.author.id;
    }
    if (currentCount.length > stats.high) {
        stats.high = currentCount.length;
    }
    if (user in stats.users) {
        stats.users[user]++;
    } else {
        stats.users[user] = 1;
    }
    let number = currentCount[currentCount.length - 1].toString();
    if (number in stats.numbers) {
        stats.numbers[number]++;
    } else {
        stats.numbers[number] = 1;
    }
    stats.total++;
}

client.on('messageCreate', async message => {
    if (message.author.bot || message.channelId !== config.channel) {
        return;
    }
    if (message.content.startsWith('!')) {
        let [cmd, ...args] = message.content.slice(1).split(' ');
        if (cmd === 'help') {
            await message.reply('!help - show this message\n!calc - calculate math\n!topusers - show the top users\n!stats - show basic statistics\n!topseqs - show the top sequences\n!topnumbers - show the top numbers\n\n!topusers, !topseqs, and !topnumbers are paged, you can do `!topusers 2` to show the second page, etc');
            return;
        } else if (cmd === 'calc') {
            try {
                await message.reply(String(evaluate(args.join(' '))));
            } catch (error) {
                await message.reply(String(error));
            }
            return;
        } else if (cmd === 'stats') {
            await message.reply(`Total numbers counted: ${stats.total}\nHighest chain: ${stats.high}\nCurrent chain: ${currentCount.length}`);
            return;
        } else if (cmd === 'topusers' || cmd === 'topseqs' || cmd === 'topnumbers') {
            let page = Number(args[0] ?? '0');
            let data = Object.entries(stats[cmd.slice(3) as 'users' | 'seqs' | 'numbers']);
            data = data.sort((x, y) => y[1] - x[1]);
            data = data.slice(10 * page, 10 * (page + 1));
            let out = '';
            for (let [x, y] of data) {
                if (cmd === 'topusers') {
                    if (!message.guild) {
                        throw new Error('This error should not occur (message.guild is undefined)');
                    }
                    out += (await message.guild.members.fetch(x)).user.username;
                } else  {
                    out += x;
                }
                out += ': ' + y + '\n';
            }
            if (out === '') {
                out = 'No data!';
            }
            await message.reply(out);
            return;
        }
    }
    let value: bigint;
    try {
        value = evaluate(message.content);
    } catch {
        return;
    }
    currentCount.push(value);
    if (previousSeq && previousSeq.elements[currentCount.length - 1] === value) {
        await success(message);
        return;
    }
    let {seq, ranOut} = findSequence(currentCount);
    if (!seq) {
        currentCount = [];
        if (!previousSeq) {
            await fail(message, 'No sequence starts with that number!');
        } else if (ranOut) {
            await fail(message, 'The sequence ran out of example terms', false);
        } else {
            await fail(message, `You broke the chain! We were following ${previousSeq.id} (${previousSeq.name})`);
        }
    } else {
        previousSeq = seq;
        await success(message);
    }
});

client.login(config.token);
