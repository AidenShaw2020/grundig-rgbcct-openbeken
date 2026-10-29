import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';

const deviceId = process.env.OPENBEKEN_DEVICE_ID || 'grundig_led';
assert(/^[a-zA-Z0-9_-]+$/.test(deviceId), 'OPENBEKEN_DEVICE_ID must contain only letters, digits, underscores or hyphens');
const output = process.env.OPENBEKEN_OUTPUT ? new URL('file:///' + process.env.OPENBEKEN_OUTPUT.replace(/\\/g, '/')) : new URL('../device/homeassistant.yaml', import.meta.url);
const stateTopic = `${deviceId}/grundig/state/get`;
const effects = ['Rainbow Cycle', 'Fire', 'Shooting Star', 'Comet', 'Theater Chase', 'Theater Chase Rainbow'];
const device = {
    identifiers: [process.env.OPENBEKEN_HA_DEVICE_ID || deviceId],
    name: 'Grundig RGB+CCT',
    manufacturer: 'Grundig',
    model: '3221698 / BK7231N OpenBeken',
};
const common = {
    schema: 'template',
    command_topic: `cmnd/${deviceId}/Backlog`,
    availability_topic: `${deviceId}/connected`,
    payload_available: 'online',
    payload_not_available: 'offline',
    optimistic: false,
    retain: false,
    qos: 0,
    device,
};

const persistenceOutput = new URL('../device/grundig-persist.bat', import.meta.url);
const colorUnpack = [
    ...Array.from({length: 12}, (_, index) => {
        const segment = index + 1;
        const slot = 55 + Math.trunc(index / 3);
        const shift = [1, 16, 256][index % 3];
        const low = shift === 1 ? `($CH${slot}%16)` : `(($CH${slot}/${shift})%16)`;
        return `Ch${segment} $CH${segment}*512+(($CH${segment + 25}/1024)%32)*16+${low}`;
    }),
    ...Array.from({length: 12}, (_, index) => {
        const segment = index + 13;
        const slot = [59, 62, 51, 52, 53, 54][Math.trunc(index / 2)];
        const shift = index % 2 === 0 ? 128 : 2048;
        return `Ch${segment} $CH${segment}*512+(($CH${segment + 25}/1024)%32)*16+(($CH${slot}/${shift})%16)`;
    }),
    'Ch25 $CH25*512+(($CH50/1024)%32)*16+(($CH61/128)%16)',
    'Ch60 $CH60*512+(($CH63/64)%512)',
];
const persistence = [
    'save:',
    'stopScript 705 1',
    'if $CH59!=0||$CH57!=$CH58 then goto save_wait',
    ...Array.from({length: 5}, (_, group) => 'backlog ' + Array.from({length: 5}, (__, offset) => {
        const segment = group * 5 + offset + 1;
        return `SetStartValue ${segment} ($CH${segment}/512)`;
    }).join(';')),
    ...Array.from({length: 5}, (_, group) => 'backlog ' + Array.from({length: 5}, (__, offset) => {
        const segment = group * 5 + offset + 1;
        return `SetStartValue ${segment + 25} $CH${segment + 25}+(($CH${segment}/16)%32)*1024`;
    }).join(';')),
    'backlog SetStartValue 55 ($CH1%16)+($CH2%16)*16+($CH3%16)*256;SetStartValue 56 4096+($CH4%16)+($CH5%16)*16+($CH6%16)*256;SetStartValue 57 ($CH7%16)+($CH8%16)*16+($CH9%16)*256;SetStartValue 58 ($CH10%16)+($CH11%16)*16+($CH12%16)*256',
    'backlog SetStartValue 59 $CH0+($CH13%16)*128+($CH14%16)*2048;SetStartValue 62 $CH62+($CH15%16)*128+($CH16%16)*2048;SetStartValue 51 $CH51+($CH17%16)*128+($CH18%16)*2048;SetStartValue 52 $CH52+($CH19%16)*128+($CH20%16)*2048',
    'backlog SetStartValue 53 $CH53+($CH21%16)*128+($CH22%16)*2048;SetStartValue 54 $CH54+($CH23%16)*128+($CH24%16)*2048;SetStartValue 61 $CH61+($CH25%16)*128;SetStartValue 60 ($CH60/512);SetStartValue 63 20+($CH63%10)+($CH60%512)*64;SetChannel 63 20+$CH63%10',
    'return',
    'save_wait:',
    'delay_s 0.2',
    'goto save',
    'migrate:',
    'if $CH56==5 then goto migrated',
    'if $CH56<4096 then goto legacy',
    ...[0, 4, 8, 12, 16, 20, 24].map(start => 'backlog ' + colorUnpack.slice(start, start + 4).join(';')),
    ...[[26, 33], [33, 39], [39, 45], [45, 51]].map(([start, end]) => 'backlog ' + Array.from({length: end - start}, (_, offset) => {
        const channel = start + offset;
        return `Ch${channel} $CH${channel}%1024`;
    }).join(';')),
    'backlog Ch0 $CH59%128;Ch51 $CH51%128;Ch52 $CH52%128;Ch53 $CH53%128;Ch54 $CH54%128;Ch61 $CH61%128;Ch62 $CH62%128;Ch63 $CH63%64',
    'Ch56 4',
    'return',
    'legacy:',
    ...Array.from({length: 5}, (_, group) => 'backlog ' + Array.from({length: 5}, (__, offset) => {
        const channel = 26 + group * 5 + offset;
        return `Ch${channel} $CH${channel}+($CH${channel}<2)*1000`;
    }).join(';')),
    'migrated:',
    'Ch56 4',
    'return',
    '',
].join('\n');

function brightnessCommand(channel) {
    return `{% if brightness is defined %}SetChannel ${channel} {{ (brightness * 100 / 255) | round(0) | int }}; {% endif %}`;
}

function rgbState(index) {
    return {
        red_template: `{{ (value_json[${index}] | int // 65536) % 256 }}`,
        green_template: `{{ (value_json[${index}] | int // 256) % 256 }}`,
        blue_template: `{{ value_json[${index}] | int % 256 }}`,
    };
}

function rgbCommand(channel, suffix = '') {
    return `{% if red is defined and green is defined and blue is defined %}SetChannel ${channel} {{ red * 65536 + green * 256 + blue }}; ${suffix}{% endif %}`;
}

const lights = Array.from({length: 25}, (_, index) => {
    const segment = index + 1;
    const number = String(segment).padStart(2, '0');
    return {
        ...common,
        name: `Segment ${number}`,
        unique_id: `${deviceId}_grundig_segment${number}`,
        state_topic: `${deviceId}/grundig/segment${number}/get`,
        state_template: "{{ 'on' if value_json[1] % 10 == 1 and value_json[2] == 1 else 'off' }}",
        brightness_template: '{{ ((value_json[1] // 10) * 255 / 100) | round(0) | int }}',
        ...rgbState(0),
        command_on_template: rgbCommand(segment) + `{% if brightness is defined %}SetChannel ${segment + 25} {{ (brightness * 100 / 255) | round(0) | int * 10 + 1 }}; {% else %}SetChannel ${segment + 25} $CH${segment + 25}-$CH${segment + 25}%10+1; {% endif %}SetChannel 51 1`,
        command_off_template: `SetChannel ${segment + 25} $CH${segment + 25}-$CH${segment + 25}%10`,
    };
});

lights.push({
    ...common,
    name: 'Light',
    unique_id: process.env.OPENBEKEN_HA_LIGHT_ID || `${deviceId}_grundig_light`,
    state_topic: stateTopic,
    state_template: "{{ 'on' if value_json[0] != 0 else 'off' }}",
    brightness_template: '{{ (value_json[[1, 2, 6][(value_json[8] | int % 10) - 1]] * 255 / 100) | round(0) | int }}',
    ...rgbState(4),
    command_on_template: rgbCommand(60, 'grundig_global; ') + '{% if brightness is defined %}{% if red is defined %}SetChannel 52 {{ (brightness * 100 / 255) | round(0) | int }}; {% else %}' + [1, 2, 3].map((mode, index) => `if $CH63%10==${mode} then SetChannel ${[52, 53, 61][index]} {{ (brightness * 100 / 255) | round(0) | int }}; `).join('') + '{% endif %}{% endif %}{% if red is defined %}SetChannel 51 1{% else %}grundig_on{% endif %}',
    command_off_template: 'SetChannel 51 0',
}, {
    ...common,
    name: 'RGB vsechny segmenty',
    unique_id: `${deviceId}_grundig_rgb`,
    state_topic: stateTopic,
    state_template: "{{ 'on' if value_json[0] == 1 else 'off' }}",
    brightness_template: '{{ (value_json[1] * 255 / 100) | round(0) | int }}',
    ...rgbState(4),
    command_on_template: rgbCommand(60, 'grundig_global; ') + brightnessCommand(52) + 'SetChannel 51 1',
    command_off_template: 'if $CH51==1 then SetChannel 51 0',
}, {
    ...common,
    name: 'Bila CCT',
    unique_id: `${deviceId}_grundig_white`,
    state_topic: stateTopic,
    state_template: "{{ 'on' if value_json[0] == 2 else 'off' }}",
    brightness_template: '{{ (value_json[2] * 255 / 100) | round(0) | int }}',
    color_temp_kelvin: true,
    min_kelvin: 2700,
    max_kelvin: 6500,
    color_temp_template: '{{ 2700 + value_json[3] * 38 }}',
    command_on_template: brightnessCommand(53) + '{% if color_temp is defined %}SetChannel 54 {{ [[((color_temp - 2700) / 38) | round(0) | int, 0] | max, 100] | min }}; {% endif %}SetChannel 51 2',
    command_off_template: 'if $CH51==2 then SetChannel 51 0',
}, {
    ...common,
    name: 'PixelAnim',
    unique_id: `${deviceId}_grundig_animation`,
    state_topic: stateTopic,
    state_template: "{{ 'on' if value_json[0] == 3 else 'off' }}",
    brightness_template: '{{ (value_json[6] * 255 / 100) | round(0) | int }}',
    effect_list: effects,
    effect_template: `{{ ${JSON.stringify(effects)}[value_json[5] | int] }}`,
    command_on_template: brightnessCommand(61) + `{% if effect is defined %}SetChannel 0 {{ ${JSON.stringify(effects)}.index(effect) }}; {% endif %}SetChannel 51 3`,
    command_off_template: 'if $CH51==3 then SetChannel 51 0',
});

const configuration = {
    mqtt: [
        ...lights.map(light => ({light})),
        {number: {
            name: 'PixelAnim - jas',
            unique_id: process.env.OPENBEKEN_HA_ANIM_DIM_ID || `${deviceId}_grundig_animation_brightness`,
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: '61 {{ value | int }}',
            state_topic: stateTopic,
            value_template: '{{ value_json[6] | int }}',
            availability_topic: `${deviceId}/connected`,
            payload_available: 'online',
            payload_not_available: 'offline',
            min: 0,
            max: 100,
            step: 1,
            unit_of_measurement: '%',
            mode: 'slider',
            retain: false,
            qos: 0,
            device,
        }},
        {number: {
            name: 'PixelAnim interval',
            unique_id: `${deviceId}_grundig_animation_interval`,
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: '62 {{ value | int }}',
            state_topic: stateTopic,
            value_template: '{{ value_json[7] }}',
            availability_topic: `${deviceId}/connected`,
            payload_available: 'online',
            payload_not_available: 'offline',
            min: 0,
            max: 10,
            step: 1,
            mode: 'slider',
            retain: false,
            qos: 0,
            device,
        }},
        {select: {
            name: 'PixelAnim - interval',
            unique_id: process.env.OPENBEKEN_HA_INTERVAL_SELECT_ID || `${deviceId}_grundig_animation_interval_select`,
            options: ['Minimum', 'Plynuly', '2', '3', '4', '5', '6', '7', '8', '9', 'Pomalu'],
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: "62 {{ ['Minimum', 'Plynuly', '2', '3', '4', '5', '6', '7', '8', '9', 'Pomalu'].index(value) }}",
            state_topic: stateTopic,
            value_template: "{{ ['Minimum', 'Plynuly', '2', '3', '4', '5', '6', '7', '8', '9', 'Pomalu'][value_json[7] | int] }}",
            availability_topic: `${deviceId}/connected`,
            payload_available: 'online',
            payload_not_available: 'offline',
            retain: false,
            qos: 0,
            device,
        }},
        {select: {
            name: 'PixelAnim - efekt',
            unique_id: process.env.OPENBEKEN_HA_EFFECT_SELECT_ID || `${deviceId}_grundig_animation_effect`,
            options: effects,
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: `0 {{ ${JSON.stringify(effects)}.index(value) }}`,
            state_topic: stateTopic,
            value_template: `{{ ${JSON.stringify(effects)}[value_json[5] | int] }}`,
            availability_topic: `${deviceId}/connected`,
            payload_available: 'online',
            payload_not_available: 'offline',
            retain: false,
            qos: 0,
            device,
        }},
        {select: {
            name: 'Rezim',
            unique_id: process.env.OPENBEKEN_HA_SELECT_ID || `${deviceId}_grundig_mode`,
            options: ['RGB', 'Bila', 'PixelAnim'],
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: "51 {{ ['RGB', 'Bila', 'PixelAnim'].index(value) + 1 }}",
            state_topic: stateTopic,
            value_template: "{{ ['RGB', 'Bila', 'PixelAnim'][(value_json[8] | int % 10) - 1] }}",
            availability_topic: `${deviceId}/connected`,
            payload_available: 'online',
            payload_not_available: 'offline',
            retain: false,
            qos: 0,
            device,
        }},
    ],
};

const renderer = readFileSync(new URL('../device/grundig.bat', import.meta.url), 'utf8');
assert(renderer.includes('publish grundig/state [$CH51,$CH52,$CH53,$CH54,$CH60,$CH0,$CH61,$CH62,$CH63]'));
for (let segment = 1; segment <= 25; segment++) {
    const number = String(segment).padStart(2, '0');
    assert(renderer.includes(`publish grundig/segment${number} [$CH${segment},$CH${segment + 25},$CH51,$CH52]`));
}
const ids = configuration.mqtt.map(entity => Object.values(entity)[0].unique_id);
assert.equal(new Set(ids).size, 34);
assert.equal(lights.length, 29);
assert(lights.every(light => light.retain === false && light.optimistic === false));

const generated = JSON.stringify(configuration, null, 2) + '\n';
if (process.env.OPENBEKEN_DISCOVERY_OUTPUT) {
    writeFileSync(process.env.OPENBEKEN_DISCOVERY_OUTPUT, JSON.stringify(configuration.mqtt.map(entity => {
        const [component, payload] = Object.entries(entity)[0];
        return {topic: `homeassistant/${component}/${payload.unique_id}/config`, payload};
    }), null, 2) + '\n');
}
if (process.argv.includes('--check')) {
    assert.equal(readFileSync(output, 'utf8'), generated);
    assert.equal(readFileSync(persistenceOutput, 'utf8'), persistence);
    console.log('PASS: 29 lights + mode + interval, unique IDs, renderer MQTT contract, generated persistence');
} else {
    writeFileSync(output, generated);
    writeFileSync(persistenceOutput, persistence);
    console.log(`Generated ${output.pathname}`);
}