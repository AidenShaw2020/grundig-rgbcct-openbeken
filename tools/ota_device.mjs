import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {resolve, sep} from 'node:path';

const stock = process.argv.includes('--stock');
const imagePath = resolve(stock
    ? 'device/upgrade.local/firmware/1.18.319-stock/OpenBK7231N_1.18.319.rbl'
    : 'device/upgrade.local/firmware/1.18.319-grundig-noir/OpenBK7231N_1.18.319-grundig-noir.rbl');
const imageHash = stock
    ? 'c8ac7095764afecd0d4fe8a993930f9ddcd817e4ec51ca0b1f07d8f56f7de84a'
    : 'eeec60c731ad5a4d530c698ebe4990a1e1a13f1e05c0514a0291a115be1e7db1';
const expectedBuild = stock
    ? 'Built on Oct 25 2026 10:15:31 version 1.18.319'
    : 'Built on Oct 28 2026 18:47:19 version 1.18.319';
const otaStart = 0x12a000;
const filesystemEnd = 0x1d0000;
const filesystemSize = 65536;
const action = process.argv[2];
assert(['--check', '--monitor', '--backup', '--preflight', '--apply', '--verify', '--restore', '--revert-stock'].includes(action), 'Use --check, --monitor, --backup, --preflight, --apply, --verify, --restore or --revert-stock');

function hash(content) {
    return createHash('sha256').update(content).digest('hex');
}

const image = readFileSync(imagePath);
assert.equal(hash(image), imageHash, 'Firmware checksum differs from the verified build');
assert.equal(image.subarray(0, 4).toString('hex'), '52424c00', 'Not an RBL image');
assert(image.length > 96, 'Unexpected OTA image size');
assert(otaStart + Math.ceil(image.length / 4096) * 4096 <= filesystemEnd - filesystemSize, 'OTA would overwrite LittleFS');

if (action === '--check') {
    console.log(JSON.stringify({imageBytes: image.length, sha256: imageHash, validRbl: true}));
} else if (action === '--monitor') {
    const baseUrl = process.argv[3];
    assert(baseUrl && /^http:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(baseUrl), 'Specify the device HTTP origin');
    const directory = resolve('device/upgrade.local', new URL(baseUrl).hostname);
    mkdirSync(directory, {recursive: true});
    const filename = resolve(directory, 'heap-monitor-' + new Date().toISOString().replace(/[:.]/g, '-') + '.local.json');
    const socket = createConnection({host: new URL(baseUrl).hostname, port: 9000});
    const samples = new Map();
    let logs = '';
    socket.setEncoding('utf8');
    try {
        await new Promise((resolveSamples, reject) => {
            const timer = setTimeout(() => reject(new Error('No five heap samples within 15 seconds')), 15000);
            socket.once('error', error => { clearTimeout(timer); reject(error); });
            socket.on('data', chunk => {
                logs = (logs + chunk).slice(-128 * 1024);
                for (const match of logs.matchAll(/Time (\d+),[^\r\n]*?free (\d+),[^\r\n]*?socks (\d+)\/(\d+)/g)) {
                    samples.set(Number(match[1]), {uptime: Number(match[1]), freeHeap: Number(match[2]), sockets: Number(match[3]), socketLimit: Number(match[4])});
                }
                if (samples.size >= 5) { clearTimeout(timer); resolveSamples(); }
            });
        });
        const result = {state: 'complete', samples: [...samples.values()]};
        writeFileSync(filename, JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } catch (error) {
        writeFileSync(filename, JSON.stringify({state: 'failed', message: error.message, logs}, null, 2));
        throw error;
    } finally {
        socket.destroy();
    }
} else {
    const baseUrl = process.argv[3];
    assert(baseUrl && /^http:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(baseUrl), 'Specify the device HTTP origin');
    const fromBackup = ['--preflight', '--apply', '--verify', '--restore'].includes(action);
    if (fromBackup) assert(process.argv[4], 'Specify the completed backup directory');
    const root = resolve('device/upgrade.local', new URL(baseUrl).hostname);
    const directory = fromBackup ? resolve(process.argv[4]) : resolve(root, 'ota-' + new Date().toISOString().replace(/[:.]/g, '-'));
    assert(directory.startsWith(root + sep), 'Backup must belong to this device private directory');
    mkdirSync(directory, {recursive: true});
    const statusPath = resolve(directory, fromBackup ? action.slice(2) + '-status.local.json' : 'status.local.json');
    const status = {state: 'running', path: null};
    let paused = false;
    function resumeRenderer() {
        if (!paused) return;
        command('backlog stopScript 701;startScript grundig.bat render 701;AddChannel 57 1;addRepeatingEventID 30 -1 704 startScript grundig.bat publish 704');
        paused = false;
    }
    process.once('uncaughtException', error => {
        status.state = 'failed';
        status.failedPath = status.path;
        status.message = error.message;
        status.stderr = error.stderr?.toString().slice(-2048);
        try { if (!status.rebootRequested) resumeRenderer(); status.rendererResumed = !paused; }
        catch (restoreError) { status.restoreError = restoreError.message; }
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        process.exitCode = 1;
        console.error(error.message);
    });

    function request(path, body) {
        status.path = path;
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        const args = ['--noproxy', '*', '--http1.0', '--fail', '-sS', '--connect-timeout', '5', '--max-time', path === '/api/ota' ? '120' : path.startsWith('/api/flash/') ? '15' : '20'];
        if (process.env.OPENBEKEN_INTERFACE) args.push('--interface', process.env.OPENBEKEN_INTERFACE);
        if (body !== undefined) args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', '@-');
        else args.push('--retry', '2', '--retry-all-errors', '--retry-delay', '2', '--retry-max-time', '60');
        const responsePath = resolve(directory, 'response.local.bin');
        args.push('--output', responsePath, baseUrl + path);
        execFileSync('curl.exe', args, {input: body, maxBuffer: 4 * 1024 * 1024});
        return readFileSync(responsePath);
    }

    function command(text) {
        assert.equal(JSON.parse(request('/api/cmnd', Buffer.from(text)).toString()).success, 200, 'Command rejected');
    }

    function checkRenderer() {
        const scripts = request('/cmd_tool?cmd=listScripts').toString();
        const identifiers = [...scripts.matchAll(/Thread UID (\d+)/g)].map(match => Number(match[1]));
        assert(identifiers.includes(701) && identifiers.every(identifier => [701, 703, 704].includes(identifier)), 'Unexpected running script; refusing resetSVM');
        assert.equal(hash(request('/api/lfs/grundig.bat')), '0f1bd1f708f5d883ff8ba4051ab1a161a8f4cd6d0e000a211c161e7d5d2e7368', 'Only the original renderer can be paused/resumed');
    }

    function snapshot() {
        const marker = 'GRUNDIG_OTA_VERIFY';
        const page = request('/cmd_tool?cmd=' + encodeURIComponent('echo ' + marker + ' ' + Array.from({length: 64}, (_, channel) => '$CH' + channel).join(' '))).toString();
        const match = [...page.matchAll(new RegExp('Info:CMD:' + marker + ' ([^<\\r\\n]+)', 'g'))].at(-1);
        assert(match, 'Missing channel snapshot');
        const channels = match[1].trim().split(/\s+/).map(Number);
        assert.equal(channels.length, 64);
        assert(channels.every(Number.isInteger));
        return channels;
    }

    if (action === '--revert-stock') {
        assert(stock, 'Rollback requires the verified stock image');
        assert(process.argv[4], 'Specify the existing complete recovery backup');
        const recoveryBackup = resolve(process.argv[4]);
        assert(recoveryBackup.startsWith(root + sep), 'Recovery backup belongs to another device');
        const recovery = JSON.parse(readFileSync(resolve(recoveryBackup, 'backup.local.json'), 'utf8'));
        const recoveryFlash = readFileSync(resolve(recoveryBackup, 'flash-before.bin'));
        assert.equal(recovery.baseUrl, baseUrl);
        assert.equal(recoveryFlash.length, 0x200000);
        assert.equal(hash(recoveryFlash), recovery.flashHash);
        const before = JSON.parse(request('/api/info').toString());
        assert.equal(before.shortName, recovery.before.shortName);
        assert.equal(before.chipset, 'BK7231N');
        assert.equal(before.build, 'Built on Oct 28 2026 18:47:19 version 1.18.319');
        checkRenderer();
        const channels = snapshot();
        assert.equal(channels[59], 0, 'Another client owns the device lock');
        assert.equal(channels[57], channels[58], 'Renderer is not settled');
        writeFileSync(resolve(directory, 'pins.local.json'), request('/api/pins'));
        const filesystem = request('/api/fsblock');
        assert.equal(filesystem.length, filesystemSize);
        writeFileSync(resolve(directory, 'littlefs-before.bin'), filesystem);
        writeFileSync(resolve(directory, 'channels.local.json'), JSON.stringify(channels));
        writeFileSync(resolve(directory, 'backup.local.json'), JSON.stringify({
            capturedAt: new Date().toISOString(), baseUrl, before, channels, imageHash,
            settingsOnly: true, recoveryBackup, flashHash: recovery.flashHash,
            filesystemHash: hash(filesystem),
        }, null, 2));
        console.log('Using existing complete recovery backup and current settings:', directory);
        execFileSync(process.execPath, [resolve('tools/ota_device.mjs'), '--apply', baseUrl, directory, '--stock'], {stdio: 'inherit'});
        process.exit(0);
    }

    if (fromBackup) {
        const manifest = JSON.parse(readFileSync(resolve(directory, 'backup.local.json'), 'utf8'));
        assert.equal(manifest.baseUrl, baseUrl, 'Backup belongs to another device');
        assert.equal(manifest.imageHash, imageHash, 'Backup was prepared for another image');
        if (manifest.settingsOnly) {
            assert(stock && resolve(manifest.recoveryBackup).startsWith(root + sep), 'Invalid stock recovery backup');
        }
        const flash = readFileSync(resolve(manifest.settingsOnly ? manifest.recoveryBackup : directory, 'flash-before.bin'));
        const filesystem = readFileSync(resolve(directory, 'littlefs-before.bin'));
        assert.equal(flash.length, 0x200000);
        assert.equal(hash(flash), manifest.flashHash, 'Flash backup checksum differs');
        assert.equal(filesystem.length, filesystemSize);
        assert.equal(hash(filesystem), manifest.filesystemHash, 'LittleFS backup checksum differs');
        if (!manifest.settingsOnly) assert(flash.subarray(filesystemEnd - filesystemSize, filesystemEnd).equals(filesystem));
        const current = JSON.parse(request('/api/info').toString());
        assert.equal(current.chipset, 'BK7231N');
        assert.equal(current.shortName, manifest.before.shortName, 'Device identity differs');
        const updated = ['--verify', '--restore'].includes(action);
        assert.equal(current.build, updated ? expectedBuild : manifest.before.build, 'Unexpected firmware build');
        assert(request('/api/fsblock').equals(filesystem), 'LittleFS changed since backup');
        assert(request('/api/pins').equals(readFileSync(resolve(directory, 'pins.local.json'))), 'Pin configuration changed');
        checkRenderer();
        if (updated) {
            const restoredPath = resolve(directory, 'restored-live.local.json');
            const parameters = [...Array.from({length: 55}, (_, channel) => channel), 60, 61, 62, 63];
            let expected = existsSync(restoredPath) ? JSON.parse(readFileSync(restoredPath, 'utf8')).expected : manifest.channels;
            if (action === '--restore') {
                assert(process.argv[5], 'Specify the original channel snapshot');
                const source = resolve(process.argv[5]);
                assert(source.startsWith(root + sep), 'Snapshot belongs to another device');
                expected = JSON.parse(readFileSync(source, 'utf8'));
                assert(Array.isArray(expected) && expected.length === 64 && expected.every(Number.isInteger), 'Invalid original snapshot');
                assert(expected[51] >= 0 && expected[51] <= 3 && expected[63] === 0, 'Expected original renderer state');
                const actual = snapshot();
                assert.equal(actual[59], 0, 'Another client owns the device lock');
                const changes = parameters.filter(channel => actual[channel] !== expected[channel]);
                command('SetChannel 59 701');
                try {
                    for (let offset = 0; offset < changes.length; offset += 20) {
                        command('backlog ' + changes.slice(offset, offset + 20).map(channel => 'SetChannel ' + channel + ' ' + expected[channel]).join(';'));
                    }
                } finally {
                    command('backlog SetChannel 59 0;AddChannel 57 1');
                }
            }
            let actual;
            for (let attempt = 0; attempt < 5; attempt++) {
                actual = snapshot();
                if (actual[57] === actual[58] && actual[59] === 0) break;
            }
            assert.equal(actual[57], actual[58], 'Renderer did not acknowledge the update');
            assert.equal(actual[59], 0, 'Renderer lock did not clear');
            for (const channel of parameters) assert.equal(actual[channel], expected[channel], 'Channel differs: ' + channel);
            if (action === '--restore') writeFileSync(restoredPath, JSON.stringify({expected, actual, restoredAt: new Date().toISOString()}, null, 2));
            status.state = 'complete';
            status.info = current;
            status.channels = actual;
            writeFileSync(statusPath, JSON.stringify(status, null, 2));
            console.log(JSON.stringify({verifiedBuild: current.build, filesystemUnchanged: true, mode: actual[51], brightness: [actual[52], actual[53], actual[61]], revision: [actual[57], actual[58]], allParametersMatch: true}));
            process.exit(0);
        }
        if (action === '--preflight') {
            status.state = 'complete';
            writeFileSync(statusPath, JSON.stringify(status, null, 2));
            console.log(JSON.stringify({preflight: 'passed', flashBackupBytes: flash.length, imageBytes: image.length, filesystemUnchanged: true}));
            process.exit(0);
        }
        paused = true;
        command('backlog cancelRepeatingEvent 704;resetSVM');
        const uploaded = JSON.parse(request('/api/ota', image).toString());
        assert.equal(uploaded.size, image.length, 'Incomplete OTA upload; do not reboot');
        const blocks = [];
        for (let offset = 0; offset < image.length; offset += 0x10000) {
            const length = Math.min(0x10000, image.length - offset);
            const block = request('/api/flash/' + (otaStart + offset).toString(16) + '-' + length.toString(16));
            assert.equal(block.length, length, 'Incomplete OTA readback');
            blocks.push(block);
        }
        assert(Buffer.concat(blocks).equals(image), 'OTA readback differs; do not reboot');
        assert(request('/api/fsblock').equals(filesystem), 'LittleFS changed during OTA; do not reboot');
        status.state = 'verified';
        status.verifiedImageHash = imageHash;
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        status.rebootRequested = true;
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        command('reboot');
        paused = false;
        status.state = 'reboot-requested';
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
        console.log(JSON.stringify({otaBytes: image.length, exactReadback: true, filesystemUnchanged: true, rebootRequested: true}));
        process.exit(0);
    }

    const before = JSON.parse(request('/api/info').toString());
    assert.equal(before.chipset, 'BK7231N', 'Wrong chipset');
    assert(/version 1\.18\.319$/.test(before.build), 'Expected original 1.18.319 firmware');
    const marker = 'GRUNDIG_OTA_SNAPSHOT';
    const page = request('/cmd_tool?cmd=' + encodeURIComponent('echo ' + marker + ' ' + Array.from({length: 64}, (_, channel) => '$CH' + channel).join(' '))).toString();
    const match = [...page.matchAll(new RegExp('Info:CMD:' + marker + ' ([^<\\r\\n]+)', 'g'))].at(-1);
    assert(match, 'Missing channel snapshot');
    const channels = match[1].trim().split(/\s+/).map(Number);
    assert.equal(channels.length, 64);
    assert(channels.every(Number.isInteger));
    assert.equal(channels[57], channels[58], 'Renderer is not settled');
    assert.equal(channels[59], 0, 'Another client owns the device lock');
    writeFileSync(resolve(directory, 'info-before.local.json'), JSON.stringify(before, null, 2));
    writeFileSync(resolve(directory, 'channels.local.json'), JSON.stringify(channels));
    if (process.argv.includes('--pause-renderer')) {
        checkRenderer();
        paused = true;
        command('backlog cancelRepeatingEvent 704;resetSVM');
    }
    writeFileSync(resolve(directory, 'index-before.local.html'), request('/index'));
    writeFileSync(resolve(directory, 'pins.local.json'), request('/api/pins'));
    writeFileSync(resolve(directory, 'files.local.json'), request('/api/lfs/'));
    const filesystem = request('/api/fsblock');
    assert.equal(filesystem.length, 65536, 'Expected existing 64 KiB LittleFS');
    writeFileSync(resolve(directory, 'littlefs-before.bin'), filesystem);
    const monitor = spawn(process.execPath, [resolve('tools/ota_device.mjs'), '--monitor', baseUrl], {stdio: 'ignore'});
    monitor.on('error', error => {
        status.monitorError = error.message;
        writeFileSync(statusPath, JSON.stringify(status, null, 2));
    });
    const blocks = [];
    for (let address = 0; address < 0x200000; address += 0x10000) {
        const block = request('/api/flash/' + address.toString(16) + '-10000');
        assert.equal(block.length, 0x10000, 'Incomplete flash block at ' + address.toString(16));
        blocks.push(block);
    }
    const flash = Buffer.concat(blocks);
    assert.equal(flash.length, 0x200000, 'Incomplete full flash backup');
    assert(flash.some(value => value !== 0xff && value !== 0), 'Flash backup is empty');
    writeFileSync(resolve(directory, 'flash-before.bin'), flash);
    assert(readFileSync(resolve(directory, 'flash-before.bin')).equals(flash), 'Backup disk readback differs');
    assert(flash.subarray(filesystemEnd - filesystemSize, filesystemEnd).equals(filesystem), 'Flash and LittleFS backups differ');
    resumeRenderer();
    const after = JSON.parse(request('/api/info').toString());
    assert.equal(after.shortName, before.shortName, 'Device identity changed');
    assert(after.uptime_s >= before.uptime_s, 'Device restarted during backup');
    const manifest = {capturedAt: new Date().toISOString(), baseUrl, before, after, channels, imageHash, flashBytes: flash.length, flashHash: hash(flash), filesystemBytes: filesystem.length, filesystemHash: hash(filesystem)};
    writeFileSync(resolve(directory, 'backup.local.json'), JSON.stringify(manifest, null, 2));
    status.state = 'complete';
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    console.log(JSON.stringify({backupDirectory: directory, flashBytes: flash.length, filesystemBytes: filesystem.length, uptime: after.uptime_s, mode: channels[51], complete: true}));
}