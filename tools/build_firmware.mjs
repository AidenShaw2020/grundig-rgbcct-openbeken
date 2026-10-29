import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const directory = resolve('device/upgrade.local/firmware');
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const image = 'grundig-obk-build:1.18.319';
const volume = 'type=volume,source=grundig-obk-work-1.18.319,target=/src';
const action = process.argv[2];
assert(['--reference', '--minimal', '--size', '--status'].includes(action), 'Use --reference, --minimal, --size or --status');
mkdirSync(directory, {recursive: true});

if (action === '--status') {
    console.log(readFileSync(resolve(directory, 'build-status.local.json'), 'utf8'));
} else {
    const minimal = action === '--minimal';
    const version = minimal ? '1.18.319-grundig-noir' : '1.18.319-baseline';
    const args = ['run', '--rm', '--user', '0', '--mount', volume];
    if (action === '--size') {
        args.push('--entrypoint', 'arm-none-eabi-size', image);
        for (const name of ['1.18.319-baseline', '1.18.319-grundig-noir']) args.push(`/src/output/${name}/OpenBK7231N_${name}.axf`);
    } else {
        args.push('--name', minimal ? 'grundig-obk-minimal' : 'grundig-obk-baseline', '--workdir', '/src', '--env', 'MAKEFLAGS=-j4', '--entrypoint', 'make', image, 'OBK_VARIANT=' + (minimal ? 11 : 0), 'APP_VERSION=' + version, 'OpenBK7231N');
    }
    const started = new Date().toISOString();
    const statusPath = resolve(directory, 'build-status.local.json');
    writeFileSync(statusPath, JSON.stringify({action, started, state: 'running'}, null, 2));
    const result = spawnSync(docker, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    const output = (result.stdout || '') + (result.stderr || '');
    writeFileSync(resolve(directory, (action.slice(2)) + '-build.local.log'), output);
    const status = {action, started, finished: new Date().toISOString(), state: 'finished', exitCode: result.status, error: result.error?.message, tail: output.trim().split(/\r?\n/).slice(-20)};
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = result.status === 0 ? 0 : 1;
}