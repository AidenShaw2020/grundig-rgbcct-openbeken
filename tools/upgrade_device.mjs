import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {relative, resolve} from 'node:path';
import {gzipSync} from 'node:zlib';

const baseUrl = process.argv.find(argument => argument.startsWith('http://')) || process.env.OPENBEKEN_URL;
assert(baseUrl && /^http:\/\/[a-zA-Z0-9.:-]+$/.test(baseUrl), 'Set OPENBEKEN_URL to the device HTTP origin');
const apply = process.argv.includes('--apply');
const resume = process.argv.includes('--resume');
const prepareOnly = process.argv.includes('--prepare');
const discoveryOnly = process.argv.includes('--discovery');
const verifyOnly = process.argv.includes('--verify');
assert(
    !(discoveryOnly && (apply || resume || prepareOnly || verifyOnly)),
    'Do not combine --discovery with other modes',
);
const directory = resolve('device/upgrade.local', new URL(baseUrl).hostname);
mkdirSync(directory, {recursive: true});
const statusPath = resolve(directory, 'deployment-status.local.json');
const status = {state: 'running', path: null};
process.once('uncaughtException', error => {
    status.state = 'failed';
    status.message = error.message;
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    console.error(error.message);
    process.exitCode = 1;
});

function request(path, body) {
    status.path = path;
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    const args = ['--noproxy', '*', '--http1.0', '-sS', '--fail', '--connect-timeout', '5', '--max-time', '90'];
    if (process.env.OPENBEKEN_INTERFACE) args.push('--interface', process.env.OPENBEKEN_INTERFACE);
    if (body === undefined) args.push('--retry', '2', '--retry-all-errors', '--retry-delay', '2', '--retry-max-time', '60');
    if (body !== undefined && path.startsWith('/api/lfs/')) args.push('--limit-rate', '2k');
    if (body !== undefined) args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', '@-');
    const responsePath = resolve(directory, 'deployment-response.local.bin');
    args.push('--output', responsePath, baseUrl + path);
    execFileSync('curl.exe', args, {input: body, maxBuffer: 1024 * 1024});
    return readFileSync(responsePath);
}

function command(text) {
    let lastError;
    const attempts = text === 'reboot' ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const result = JSON.parse(request('/api/cmnd', Buffer.from(text)).toString());
            assert.equal(result.success, 200, 'Command rejected: ' + text);
            return;
        } catch (error) { lastError = error; }
    }
    throw lastError;
}

function consoleCommand(text) {
    const page = request('/cmd_tool?cmd=' + encodeURIComponent(text) + '&fresh=' + Date.now()).toString();
    assert(!/Error:CMD:|Unknown command|Invalid command/.test(page), 'Console command failed');
    return page;
}

function snapshot() {
    const channels = Array.from({length: 64}, (_, channel) => channel);
    const page = consoleCommand('echo GRUNDIG_UPGRADE ' + channels.map(channel => '$CH' + channel).join(' '));
    const match = page.match(/Info:CMD:GRUNDIG_UPGRADE ([^<\r\n]+)/);
    assert(match, 'Missing snapshot response');
    const values = match[1].trim().split(/\s+/).map(Number);
    assert.equal(values.length, channels.length);
    assert(values.every(Number.isInteger));
    return Object.fromEntries(channels.map((channel, index) => [channel, values[index]]));
}

function upload(name, content) {
    assert(content.length < 2048, 'Large files require a verified offline filesystem image');
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const result = JSON.parse(request('/api/lfs/' + name, content).toString());
            assert.equal(result.size, content.length, 'Incomplete upload: ' + name);
            assert(request('/api/lfs/' + name).equals(content), 'Readback differs: ' + name);
            return;
        } catch (error) {
            lastError = error;
            try { if (request('/api/lfs/' + name).equals(content)) return; }
            catch {}
        }
    }
    throw lastError;
}

function confirmed() {
    const deadline = Date.now() + 45000;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const values = snapshot();
            assert.equal(values[56], values[51] === 3 ? 2 : 1);
            assert.equal(values[57], values[58]);
            assert.equal(values[59], 0);
            assert([11, 12, 13, 21, 22, 23].includes(values[63]));
            return values;
        } catch (error) { lastError = error; }
    }
    throw lastError;
}

const info = JSON.parse(request('/api/info').toString());
assert(!process.argv.includes('--stage'), 'Use --resume --prepare to validate an offline image without modifying the device');
let name;
for (let attempt = 0; attempt < 4; attempt++) {
    const namePage = consoleCommand('echo GRUNDIG_NAME $Name');
    name = [...namePage.matchAll(/Info:CMD:GRUNDIG_NAME ([^<\r\n]+)/g)].at(-1)?.[1]?.trim();
    if (name && name !== '0.1') break;
}
if (!name || name === '0.1') {
    const suffix = info.shortName?.replace(/^obk/i, '');
    if (suffix && /^[0-9A-Fa-f]{8}$/.test(suffix)) {
        name = `Open${info.chipset}_${suffix}`;
        command('FriendlyName ' + name);
    }
}
assert(name && /^[a-zA-Z0-9_-]+$/.test(name), 'Device name needs explicit HA identity mapping');

if (verifyOnly) {
    const expected = JSON.parse(readFileSync(resolve(directory, 'expected.local.json'), 'utf8'));
    const actual = confirmed();
    for (const [channel, value] of Object.entries(expected)) {
        if (Number(channel) === 63) assert.equal(actual[channel] % 10, value % 10);
        else assert.equal(actual[channel], value, 'Restored channel differs: ' + channel);
    }
    console.log('PASS: restart restored mode, all 25 colors and levels, global brightness, white and animation settings', baseUrl);
    process.exit(0);
}

if (!apply && !resume && !discoveryOnly) {
    const values = snapshot();
    console.log(JSON.stringify({device: info.shortName, name, mode: values[51], brightness: [values[52], values[53], values[61]], revision: [values[57], values[58]], lock: values[59], profile: values[63], uptime: info.uptime_s, savedProfile: request('/api/lfs/grundig-state.bat').toString().slice(0, 100)}));
    process.exit(0);
}

if (apply || resume) {
    const before = snapshot();
    assert.equal(before[59], 0, 'Another client owns the device lock');
    assert(resume || before[57] === before[58], 'Renderer is not settled');
    assert(resume || before[63] < 11, 'Already upgraded; do not migrate segment levels twice');
    const backup = resolve(directory, new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(backup, {recursive: true});
    for (const filename of ['autoexec.bat', 'grundig.bat', 'grundig-state.bat', 'grundig.html.gz', 'grundig-rgb.js']) {
        writeFileSync(resolve(backup, filename), request('/api/lfs/' + filename));
    }
    const filesystemBefore = request('/api/fsblock');
    assert.equal(filesystemBefore.length, 65536, 'Unexpected filesystem geometry');
    writeFileSync(resolve(backup, 'littlefs-before.bin'), filesystemBefore);
    writeFileSync(resolve(backup, 'channels.local.json'), JSON.stringify(before, null, 2));
    writeFileSync(resolve(backup, 'info.local.json'), JSON.stringify(info, null, 2));
    const expected = resume ? JSON.parse(readFileSync(resolve(directory, 'expected.local.json'), 'utf8')) : Object.fromEntries([0, ...Array.from({length: 54}, (_, index) => index + 1), 60, 61, 62].map(channel => [channel, before[channel]]));
    if (!resume) {
        for (let channel = 26; channel <= 50; channel++) expected[channel] += 1000;
        expected[63] = 10 + (before[51] || 1);
    }
    writeFileSync(resolve(directory, 'expected.local.json'), JSON.stringify(expected, null, 2));
    const profile = Object.entries(expected).map(([channel, value]) => `SetChannel ${channel} ${value}`).join('\n') + '\nSetChannel 56 5\nreturn\n';
    status.backup = backup;
    status.filesystemBeforeHash = createHash('sha256').update(filesystemBefore).digest('hex');
    const payload = resolve(backup, 'payload');
    mkdirSync(payload, {recursive: true});
    const replacements = {
        'grundig.bat': readFileSync(new URL('../device/grundig.bat', import.meta.url)),
        'grundig-persist.bat': readFileSync(new URL('../device/grundig-persist.bat', import.meta.url)),
        'grundig.html.gz': gzipSync(readFileSync(new URL('../device/grundig.html', import.meta.url)), {level: 9}),
        'grundig-state.bat': Buffer.from(profile),
    };
    const inContainer = path => '/p/' + relative(resolve('.'), path).replaceAll('\\', '/');
    const argumentsForImage = [inContainer(resolve(backup, 'littlefs-before.bin')), inContainer(resolve(backup, 'littlefs-after.bin'))];
    for (const [filename, content] of Object.entries(replacements)) {
        writeFileSync(resolve(payload, filename), content);
        argumentsForImage.push(filename, inContainer(resolve(payload, filename)));
    }
    execFileSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe', [
        'run', '--rm', '--entrypoint', '/p/device/upgrade.local/lfs_image', '-v', resolve('.') + ':/p',
        'grundig-obk-build:1.18.319', ...argumentsForImage,
    ], {stdio: 'inherit'});
    const filesystemAfter = readFileSync(resolve(backup, 'littlefs-after.bin'));
    assert.equal(filesystemAfter.length, filesystemBefore.length);
    status.filesystemAfterHash = createHash('sha256').update(filesystemAfter).digest('hex');
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    if (prepareOnly) {
        status.state = 'prepared';
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        console.log('PASS: offline image verified; device files unchanged', backup);
        process.exit(0);
    }
    command('cancelRepeatingEvent 704');
    command('cancelRepeatingEvent 705');
    command('resetSVM');
    try {
        assert.equal(JSON.parse(request('/api/info')).mac, info.mac, 'Device identity changed');
        let written = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            const postResult = JSON.parse(request('/api/fsblock', filesystemAfter).toString());
            if (postResult.size === filesystemAfter.length && request('/api/fsblock').subarray(4096).equals(filesystemAfter.subarray(4096))) {
                written = true;
                break;
            }
        }
        assert(written, 'Entire filesystem readback differs');
        for (const [filename, content] of Object.entries(replacements)) {
            assert(request('/api/lfs/' + filename).equals(content), 'File readback differs: ' + filename);
        }
        for (const filename of ['autoexec.bat', 'grundig-rgb.js']) {
            assert(request('/api/lfs/' + filename).equals(readFileSync(resolve(backup, filename))), 'Protected file changed: ' + filename);
        }
    } catch (error) {
        status.rollback = 'running';
        try {
            request('/api/fsblock', filesystemBefore);
            command('backlog startScript grundig.bat render 701;AddChannel 57 1;addRepeatingEventID 30 -1 704 startScript grundig.bat publish 704');
            status.rollback = 'complete';
        } catch (restoreError) { status.rollback = restoreError.message; }
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        throw error;
    }
    command('SetFlag 27 0');
    command('backlog SetChannel 56 0;SetStartValue 56 0;SetStartValue 63 0');
    console.log('PASS: backup, exact script/UI/profile readback; restarting', baseUrl);
    command('reboot');
    const actual = confirmed();
    for (const [channel, value] of Object.entries(expected)) {
        if (Number(channel) === 63) assert.equal(actual[channel] % 10, value % 10);
        else assert.equal(actual[channel], value, 'Restored channel differs: ' + channel);
    }
    console.log('PASS: original light state restored after restart', baseUrl);
}

if (process.argv.includes('--no-discovery')) {
    status.state = 'complete';
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    process.exit(0);
}

const packagePath = resolve(directory, 'homeassistant.local.json');
const discoveryPath = resolve(directory, 'discovery.local.json');
execFileSync(process.execPath, ['tools/generate_ha.mjs'], {
    env: {
        ...process.env,
        OPENBEKEN_DEVICE_ID: info.mqtttopic,
        OPENBEKEN_HA_DEVICE_ID: name,
        OPENBEKEN_HA_LIGHT_ID: name + '_light',
        OPENBEKEN_HA_SELECT_ID: name + '_select_Grundig_-_rezim',
        OPENBEKEN_HA_EFFECT_SELECT_ID: name + '_select_PixelAnim_-_efekt',
        OPENBEKEN_HA_INTERVAL_SELECT_ID: name + '_select_PixelAnim_-_interval',
        OPENBEKEN_HA_ANIM_DIM_ID: name + '_number_61',
        OPENBEKEN_OUTPUT: packagePath,
        OPENBEKEN_DISCOVERY_OUTPUT: discoveryPath,
    },
    stdio: 'pipe',
});
command('SetFlag 7 1');
try {
    for (const {topic, payload} of JSON.parse(readFileSync(discoveryPath, 'utf8'))) {
        const content = Buffer.from(JSON.stringify(payload).replaceAll('$', '\\u0024'));
        assert(!content.includes(0x24), 'Unescaped $ in discovery payload: ' + topic);
        assert.deepEqual(JSON.parse(content.toString()), payload, 'Invalid JSON discovery payload: ' + topic);
        assert(content.length < 2048, 'Discovery payload exceeds MQTT buffer budget: ' + topic);
        upload('grundig-discovery.json', content);
        command('publishFile ' + topic + ' grundig-discovery.json 1');
    }
    upload('grundig-discovery.json', Buffer.from(''));
    for (const staleTopic of [
        `homeassistant/sensor/${name}_sensor_56/config`,
        `homeassistant/sensor/${name}_sensor_60/config`,
        `homeassistant/number/${name}_number_52/config`,
        `homeassistant/number/${name}_number_53/config`,
        `homeassistant/number/${name}_number_54/config`,
        'homeassistant/light/0.1_light/config',
        'homeassistant/select/0.1_select_Grundig_-_rezim/config',
        'homeassistant/select/0.1_select_PixelAnim_-_efekt/config',
        'homeassistant/select/0.1_select_PixelAnim_-_interval/config',
        'homeassistant/number/0.1_number_61/config',
    ]) {
        command('publishFile ' + staleTopic + ' grundig-discovery.json 1');
    }
} finally {
    command('SetFlag 7 0');
    command('lfs_remove grundig-discovery.json');
}
command('grundig_publish');
status.state = 'complete';
writeFileSync(statusPath, JSON.stringify(status, null, 2));
console.log('PASS: 34 retained discovery configurations submitted using the configured device MQTT connection', baseUrl);