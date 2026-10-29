import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createContext, runInContext, Script} from 'node:vm';
import {gzipSync, gunzipSync} from 'node:zlib';

if (process.argv.includes('--check-persistence')) {
    const source = readFileSync(new URL('../device/grundig-persist.bat', import.meta.url), 'utf8').replace(/\r/g, '');
    const renderer = readFileSync(new URL('../device/grundig.bat', import.meta.url), 'utf8').replace(/\r/g, '');
    const publication = renderer.split('publish:\n')[1];
    assert.equal((publication.match(/^publish /gm) || []).length, 26);
    assert.equal((publication.match(/^delay_s 0.1/gm) || []).length, 25);
    assert(!/\npublish [^\n]+\npublish /.test(publication));
    assert(!/\blfs_(?:write|writeLine|append|appendLine|appendInt|appendFloat)\b/.test(source), 'Runtime LittleFS writes are forbidden');
    assert(renderer.includes('stopScript 704 1'));
    assert(renderer.includes('if $CH56>=4096&&$CH63%64>=21 then goto migrate_start'));
    assert(renderer.includes('if $CH63!=1&&$CH56!=3&&$CH56!=5 then goto restore_wait'));
    const saveLines = source.slice(source.indexOf('save:\n'), source.indexOf('\nsave_wait:\n')).split('\n');
    const migrateLines = source.slice(source.indexOf('migrate:\n'), source.indexOf('\nlegacy:\n')).split('\n');
    assert(saveLines.length <= 20, 'save must execute in a single 20-line QuickTick quantum');
    assert(migrateLines.length <= 20, 'migrate unpack must execute in a single 20-line QuickTick quantum');
    assert(source.split('\n').every(line => line.length < 256), 'Script lines must fit initial SVM buffer');
    const evaluate = (expression, values) => Math.trunc(runInContext(
        expression.replace(/\$CH(\d+)/g, (_, channel) => String(values[channel]))
            .replace(/\(([^()]+)\/(\d+)\)%/g, 'Math.trunc(($1)/$2)%'),
        createContext(),
    ));
    function save(values, startValues) {
        for (const line of saveLines.slice(3, -1)) {
            assert(line.startsWith('backlog '), 'Expected grouped backlog line in save');
            for (const subcommand of line.slice(8).split(';')) {
                const startMatch = subcommand.match(/^SetStartValue (\d+) (.+)$/);
                const channelMatch = subcommand.match(/^SetChannel (\d+) (.+)$/);
                assert(startMatch || channelMatch, 'Invalid save subcommand: ' + subcommand);
                if (startMatch) {
                    const slot = Number(startMatch[1]);
                    const encoded = evaluate(startMatch[2], values);
                    assert(Number.isInteger(encoded) && encoded >= 0 && encoded <= 32767, `Invalid SetStartValue[${slot}]: ${encoded}`);
                    startValues[slot] = encoded;
                } else {
                    values[channelMatch[1]] = evaluate(channelMatch[2], values);
                }
            }
        }
    }
    function unpack(values) {
        assert(values[56] >= 4096 && values[63] % 64 >= 21, 'Expected packed startup sentinels');
        for (const line of migrateLines.slice(3, -1)) {
            if (line === 'Ch56 4' || line === 'SetChannel 56 4') {
                values[56] = 4;
                continue;
            }
            assert(line.startsWith('backlog '), 'Expected grouped backlog line in migrate');
            for (const subcommand of line.slice(8).split(';')) {
                const match = subcommand.match(/^(?:SetChannel |Ch)(\d+) (.+)$/);
                assert(match, 'Invalid migrate subcommand: ' + subcommand);
                values[match[1]] = evaluate(match[2], values);
            }
        }
    }
    const sample = Object.fromEntries(Array.from({length: 64}, (_, channel) => [channel, 0]));
    Object.assign(sample, {
        0: 5, 1: 16777215, 2: 16195592, 3: 65416, 4: 1, 5: 255, 6: 65535, 12: 12345678,
        13: 8765432, 16: 11184810, 24: 16711935, 25: 255, 26: 1001, 27: 730, 28: 151,
        49: 10, 50: 991, 51: 2, 52: 73, 53: 41, 54: 29, 57: 8, 58: 8, 60: 16711680, 61: 17, 62: 4, 63: 12,
    });
    for (let channel = 29; channel <= 48; channel++) sample[channel] = (channel - 25) * 40 + (channel % 2);
    const startValues = Object.fromEntries(Array.from({length: 64}, (_, channel) => [channel, 0]));
    const live = {...sample};
    save(live, startValues);
    assert.equal(live[63], 22);
    assert.equal(startValues[0], 0, 'CH0 start value must remain 0 because led_enableAll 0 zeroes CH0');
    assert(startValues[56] >= 4096 && startValues[56] <= 8191, 'Missing CH56 packed sentinel');
    const booted = {...startValues};
    unpack(booted);
    assert.equal(booted[56], 4);
    assert.equal(booted[63], 22);
    for (const channel of [0, ...Array.from({length: 54}, (_, index) => index + 1), 60, 61, 62]) {
        assert.equal(booted[channel], sample[channel], 'Restored channel differs: ' + channel);
    }
    Object.assign(live, {51: 0, 57: 9, 58: 9});
    save(live, startValues);
    const bootedOff = {...startValues};
    unpack(bootedOff);
    assert.equal(bootedOff[51], 0);
    assert.equal(bootedOff[63], 22);
    const animLines = renderer.slice(renderer.indexOf('animation:\n'), renderer.indexOf('\nanimation_retry:\n')).split('\n');
    assert(animLines.length <= 14, 'animation path must fit in a single 20-line QuickTick quantum from render:');
    assert(animLines.every(line => line.length < 256), 'Animation script lines must fit initial SVM buffer');
    const animState = {...sample, 51: 3, 55: 8, 56: 1, 57: 8, 58: 7, 59: 0};
    animState[59] = 701 + animState[0] * 1024;
    for (const line of animLines.filter(entry => entry.startsWith('backlog Ch'))) {
        for (const subcommand of line.slice(8).split(';')) {
            const match = subcommand.match(/^Ch(\d+) (.+)$/);
            assert(match, 'Invalid animation channel subcommand: ' + subcommand);
            const value = evaluate(match[2], animState);
            assert(Number.isInteger(value) && value >= 0 && value <= 16777215, 'Out-of-range animation channel value');
            animState[match[1]] = value;
        }
        if (line.startsWith('backlog Ch30 ')) {
            for (let channel = 0; channel <= 4; channel++) animState[channel] = 0;
        }
    }
    for (const channel of [0, 1, 2, 3, 4, 26, 27, 28, 29, 30, 31, 32, 33]) {
        assert.equal(animState[channel], sample[channel], 'Animation clobbered channel: ' + channel);
    }
    console.log('PASS: paced single-flight MQTT, atomic single-quantum SetStartValue persistence, full 24-bit RGB precision, ON/OFF profiles');
    process.exit(0);
}

if (process.argv.includes('--check-ui')) {
    const html = readFileSync(new URL('../device/grundig.html', import.meta.url), 'utf8');
    const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new Script(source);
    const boundary = source.indexOf('for (let segment = 1; segment <= 25; segment++) {', source.indexOf('async function save()'));
    let requests = 0;
    let owner = 42;
    let revision = 0;
    const context = createContext({
        document: {getElementById: () => ({})},
        AbortSignal,
        DOMParser: class {
            parseFromString(text) { return {querySelectorAll: () => [], body: {textContent: text}}; }
        },
        fetch: async () => {
            requests++;
            if (owner === 42) { revision++; owner = 0; }
            if (requests === 1) throw Error('Simulated connection reset after commit');
            return {ok: true, text: async () => 'OK'};
        },
    });
    runInContext(source.slice(0, boundary), context);
    await runInContext('command(\'if $CH59==42 then "backlog AddChannel 57 1; SetChannel 59 0"\')', context);
    assert.equal(requests, 2);
    assert.equal(revision, 1);
    context.sample = Object.fromEntries(Array.from({length: 64}, (_, channel) => [channel, 0]));
    Object.assign(context.sample, {51: 3, 56: 2, 60: 65416, 61: 10, 62: 1, 63: 13});
    runInContext('validateState(sample)', context);
    const saved = runInContext('stateFile(sample)', context);
    for (const channel of [0, 51, 60, 61, 62, 63]) assert(saved.includes('SetChannel ' + channel + ' ' + context.sample[channel] + '\n'));
    assert(saved.includes('SetChannel 56 5\nreturn\n'));
    console.log('PASS: UI syntax, transport retry after lost commit response, single revision, full power/mode/color profile');
    const nativeSource = readFileSync(new URL('../device/grundig-rgb.js', import.meta.url), 'utf8');
    const row = {textContent: 'Channel RGB = 65416', hidden: false};
    const toggleRow = {hidden: false};
    const heading = {textContent: 'LED RGB Color [ACTIVE]'};
    const picker = {id: 'color131', value: '#ff1900', closest: () => ({querySelector: () => heading})};
    const nativeDocument = {
        body: {},
        activeElement: null,
        querySelector: selector => {
            assert.equal(selector, 'input[name="tgl"][value="130"]');
            return {closest: () => toggleRow};
        },
        getElementById: id => id === 'color131' ? picker : {closest: () => row},
        addEventListener: (name, handler, capture) => {
            assert.equal(name, 'change');
            assert.equal(capture, true);
            nativeDocument.change = handler;
        },
    };
    const nativeLocation = {href: ''};
    let updateNative;
    runInContext(nativeSource, createContext({
        document: nativeDocument,
        location: nativeLocation,
        MutationObserver: class {
            constructor(callback) { updateNative = callback; }
            observe(target) { assert.equal(target, nativeDocument.body); }
        },
    }));
    assert.equal(picker.value, '#00ff88');
    assert.equal(row.hidden, true);
    assert.equal(toggleRow.hidden, true);
    assert.equal(heading.textContent, 'Grundig RGB - barva');
    for (const [hex, packed] of [['#ff0000', 16711680], ['#00ff00', 65280], ['#0000ff', 255]]) {
        let prevented = false;
        let stopped = false;
        picker.value = hex;
        nativeDocument.change({target: picker, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; }});
        assert(prevented && stopped, 'Generic native LED submission was not suppressed');
        assert.equal(nativeLocation.href, '/index?setIndex=60&set=' + packed);
    }
    nativeLocation.href = '';
    nativeDocument.change({target: {id: 'unrelated'}});
    assert.equal(nativeLocation.href, '');
    nativeDocument.activeElement = picker;
    toggleRow.hidden = false;
    updateNative();
    assert.equal(toggleRow.hidden, true, 'Refresh restored the generic power button');
    assert.equal(picker.value, '#0000ff', 'Refresh overwrote an active picker');
    nativeDocument.getElementById = id => id === 'color131' ? picker : {closest: () => null};
    nativeDocument.querySelector = () => null;
    updateNative();
    console.log('PASS: native RGB state, RGB primary colors route only to CH60, generic submit blocked, active picker preserved, Toggle Light hidden across refresh');
    process.exit(0);
}

const baseUrl = process.env.OPENBEKEN_URL || 'http://192.168.4.1';
const channels = [0, ...Array.from({length: 25}, (_, index) => index + 1), 51, 52, 56, 57, 58, 59];

function request(path, body) {
    const args = ['-sS', '--fail', '--max-time', '10'];
    if (body !== undefined) args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', '@-');
    args.push(baseUrl + path);
    return execFileSync('curl.exe', args, {input: body, maxBuffer: 1024 * 1024});
}

function command(text) {
    const response = JSON.parse(request('/api/cmnd', Buffer.from(text)).toString());
    assert.equal(response.success, 200);
}

function setChannel(channel, value) {
    request(`/index?setIndex=${channel}&set=${value}`);
}

if (process.argv.includes('--deploy-ui')) {
    const nativeRgb = readFileSync(new URL('../device/grundig-rgb.js', import.meta.url));
    const nativeUploaded = JSON.parse(request('/api/lfs/grundig-rgb.js', nativeRgb).toString());
    assert.equal(nativeUploaded.size, nativeRgb.length);
    assert(request('/api/lfs/grundig-rgb.js').equals(nativeRgb), 'Native RGB script readback differs');
    const renderer = readFileSync(new URL('../device/grundig.bat', import.meta.url), 'utf8');
    for (const line of renderer.split(/\r?\n/).filter(line => /^setChannel(?:Type|Label) 60 /i.test(line))) command(line);
    const html = readFileSync(new URL('../device/grundig.html', import.meta.url));
    const compressed = gzipSync(html, {level: 9});
    const uploaded = JSON.parse(request('/api/lfs/grundig.html.gz', compressed).toString());
    assert.equal(uploaded.size, compressed.length);
    const actual = request('/api/lfs/grundig.html.gz');
    assert(actual.equals(compressed));
    assert(gunzipSync(actual).equals(html));
    console.log('PASS: native RGB script readback and registration, exact gzip and HTML readback', actual.length);
    process.exit(0);
}

function snapshot() {
    let output = '';
    for (let attempt = 0; attempt < 4; attempt++) {
        const text = 'echo GRUNDIG_CHECK ' + channels.map(channel => '$CH' + channel).join(' ');
        output = request('/cmd_tool?cmd=' + encodeURIComponent(text) + '&fresh=' + Date.now()).toString();
        const match = output.match(/Info:CMD:GRUNDIG_CHECK ([^<\r\n]+)/);
        if (!match) continue;
        const values = match[1].trim().split(/\s+/).map(Number);
        if (values.length === channels.length && values.every(Number.isFinite)) {
            return Object.fromEntries(channels.map((channel, index) => [channel, values[index]]));
        }
    }
    throw Error('Incomplete state: ' + (output.match(/(?:Info|Error):[^<\r\n]+/g) || []).join(' | '));
}

function confirmed(mode, backend) {
    let state;
    for (let attempt = 0; attempt < 12; attempt++) {
        state = snapshot();
        if (state[51] === mode && state[56] === backend && state[57] === state[58] && state[59] === 0) return state;
    }
    throw Error('Unconfirmed renderer state: ' + JSON.stringify(state));
}

if (process.argv.includes('--connect')) {
    assert(process.env.OPENBEKEN_WIFI_PROFILE, 'Set OPENBEKEN_WIFI_PROFILE to an existing Windows WLAN profile before using --connect');
    console.log(execFileSync('netsh.exe', ['wlan', 'connect', 'name=' + process.env.OPENBEKEN_WIFI_PROFILE, 'interface=Wi-Fi'], {encoding: 'utf8'}));
}

setChannel(51, 0);
const before = snapshot();
console.log('Initial mode:', before[51], 'revision:', before[57]);

try {
    if (process.argv.includes('--deploy')) {
        command('cancelRepeatingEvent 704');
        command('resetSVM');
        const renderer = Buffer.from(readFileSync(new URL('../device/grundig.bat', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
        const uploaded = JSON.parse(request('/api/lfs/grundig.bat', renderer).toString());
        assert.equal(uploaded.size, renderer.length);
        assert(request('/api/lfs/grundig.bat').equals(renderer), 'Renderer readback differs');
        command('startScript grundig.bat render 701');
        command('AddChannel 57 1');
        command('addRepeatingEventID 30 -1 704 startScript grundig.bat publish 704');
        console.log('PASS: exact renderer readback and live resume without restoring saved profile');
    }
    for (const [mode, backend] of [[3, 2], [2, 1], [1, 1]]) {
        if (mode === 1) setChannel(52, 5);
        setChannel(51, mode);
        const first = confirmed(mode, backend);
        const second = confirmed(mode, backend);
        assert.equal(second[57], first[57], 'Revision changed without a user request');
        for (let segment = 1; segment <= 25; segment++) {
            assert.equal(second[segment], before[segment], 'Stored color changed for segment ' + segment);
        }
        console.log('PASS: mode', mode, 'backend', backend, 'stable revision', second[57], '25 colors preserved');
    }
} finally {
    setChannel(51, 0);
    setChannel(52, before[52]);
}
const final = confirmed(0, 1);
console.log('PASS: final OFF, original RGB brightness, acknowledged revision', final[58]);