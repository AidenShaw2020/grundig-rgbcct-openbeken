import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createConnection} from 'node:net';

const baseUrl = process.argv.find(argument => argument.startsWith('http://')) || process.env.OPENBEKEN_URL;
assert(baseUrl && /^http:\/\/[a-zA-Z0-9.:-]+$/.test(baseUrl), 'Set OPENBEKEN_URL to the device HTTP origin');
const directory = resolve('device/upgrade.local', new URL(baseUrl).hostname);
mkdirSync(directory, {recursive: true});

function request(path) {
    return execFileSync('curl.exe', ['-sS', '--fail', '--max-time', '10', baseUrl + path], {maxBuffer: 1024 * 1024});
}

function consoleOutput(command) {
    const page = request('/cmd_tool?cmd=' + encodeURIComponent(command)).toString();
    return [...page.matchAll(/(?:Info|Error):CMD:([^<\r\n]+)/g)].map(match => match[1]);
}

function hash(content) {
    return createHash('sha256').update(content).digest('hex');
}

if (process.argv.includes('--probe-upload')) {
    const before = JSON.parse(request('/api/info').toString());
    const content = readFileSync(new URL('../device/grundig.bat', import.meta.url));
    const filename = 'grundig-upload-probe.txt';
    const socket = createConnection({host: new URL(baseUrl).hostname, port: 9000});
    let logs = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => { logs = (logs + chunk).slice(-128 * 1024); });
    await new Promise((resolveConnected, reject) => {
        socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('TCP log connection timed out')); });
        socket.once('connect', resolveConnected);
        socket.once('error', reject);
    });
    socket.setTimeout(0);
    let socketError;
    socket.on('error', error => { socketError = error.message; });
    let response = '';
    let stderr = '';
    let code;
    try {
        code = await new Promise((resolveExit, reject) => {
            const args = ['-sS', '--fail', '--max-time', '30'];
            if (process.argv.includes('--paced')) args.push('--limit-rate', '2k');
            args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', '@-', baseUrl + '/api/lfs/' + filename);
            const child = spawn('curl.exe', args);
            child.on('error', reject);
            child.stdout.on('data', chunk => { response += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });
            child.on('close', resolveExit);
            child.stdin.on('error', () => {});
            child.stdin.end(content);
        });
    } finally {
        socket.destroy();
        writeFileSync(resolve(directory, 'upload-probe-log.local.txt'), logs);
    }
    const result = {beforeUptime: before.uptime_s, bytes: content.length, code, response, stderr, socketError, evidence: logs.split(/\r?\n/).filter(line => /Time .*free|heap|reboot|Publish err|reconnect|LFS|SVM/i.test(line))};
    if (code === 0) {
        result.exactReadback = request('/api/lfs/' + filename).equals(content);
        const deletion = execFileSync('curl.exe', ['-sS', '--http0.9', '--max-time', '10', baseUrl + '/api/del/' + filename]).toString().trim();
        result.probeRemoved = deletion === 'OK';
    }
    try { result.afterUptime = JSON.parse(request('/api/info').toString()).uptime_s; }
    catch { result.afterUptime = null; }
    writeFileSync(resolve(directory, 'upload-probe.local.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = code === 0 && result.exactReadback && result.probeRemoved ? 0 : 1;
} else {
const info = JSON.parse(request('/api/info').toString());
const index = request('/index').toString();
const lines = index.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '\n').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const result = {
    capturedAt: new Date().toISOString(),
    device: info.shortName,
    uptime: info.uptime_s,
    build: info.build,
    status: lines.filter(line => /heap|memory|reset|reboot|boot|RSSI|MQTT|uptime|reason/i.test(line)),
    channels: consoleOutput('echo DIAGNOSTIC_CHANNELS ' + Array.from({length: 64}, (_, channel) => '$CH' + channel).join(' ')),
    scripts: consoleOutput('listScripts'),
    files: JSON.parse(request('/api/lfs/').toString()),
};
for (const filename of ['grundig.bat', 'grundig-state.bat', 'grundig-persist.bat']) {
    try {
        const content = request('/api/lfs/' + filename);
        writeFileSync(resolve(directory, 'diagnostic-' + filename), content);
        const local = resolve('device', filename);
        result[filename] = {bytes: content.length, hash: hash(content), matchesLocal: existsSync(local) && content.equals(readFileSync(local))};
    } catch (error) {
        result[filename] = {error: error.message.split('\n')[0]};
    }
}
writeFileSync(resolve(directory, 'diagnostic.local.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
}