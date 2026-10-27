import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';

const deviceId = process.env.OPENBEKEN_DEVICE_ID || 'grundig_led';
assert(/^[a-zA-Z0-9_-]+$/.test(deviceId), 'OPENBEKEN_DEVICE_ID must contain only letters, digits, underscores or hyphens');
const output = new URL('../device/homeassistant.yaml', import.meta.url);
const stateTopic = `${deviceId}/grundig/state/get`;
const effects = ['Rainbow Cycle', 'Fire', 'Shooting Star', 'Comet', 'Theater Chase', 'Theater Chase Rainbow'];
const device = {
    identifiers: [deviceId],
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
        state_template: "{{ 'on' if value_json[1] == 1 and value_json[2] == 1 else 'off' }}",
        brightness_template: '{{ (value_json[3] * 255 / 100) | round(0) | int }}',
        ...rgbState(0),
        command_on_template: rgbCommand(segment) + brightnessCommand(52) + `SetChannel ${segment + 25} 1; if $CH51!=2 then SetChannel 51 1`,
        command_off_template: `SetChannel ${segment + 25} 0`,
    };
});

lights.push({
    ...common,
    name: 'RGB vsechny segmenty',
    unique_id: `${deviceId}_grundig_rgb`,
    state_topic: stateTopic,
    state_template: "{{ 'on' if value_json[0] == 1 else 'off' }}",
    brightness_template: '{{ (value_json[1] * 255 / 100) | round(0) | int }}',
    ...rgbState(4),
    command_on_template: rgbCommand(60, 'grundig_global; ') + brightnessCommand(52) + 'if $CH51!=2 then SetChannel 51 1',
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
            name: 'PixelAnim interval',
            unique_id: `${deviceId}_grundig_animation_interval`,
            command_topic: `cmnd/${deviceId}/SetChannel`,
            command_template: '62 {{ value | int }}',
            state_topic: stateTopic,
            value_template: '{{ value_json[7] }}',
            availability_topic: `${deviceId}/connected`,
            min: 0,
            max: 10,
            step: 1,
            mode: 'slider',
            retain: false,
            qos: 0,
            device,
        }},
    ],
};

const renderer = readFileSync(new URL('../device/grundig.bat', import.meta.url), 'utf8');
assert(renderer.includes('publish grundig/state [$CH51,$CH52,$CH53,$CH54,$CH60,$CH0,$CH61,$CH62]'));
for (let segment = 1; segment <= 25; segment++) {
    const number = String(segment).padStart(2, '0');
    assert(renderer.includes(`publish grundig/segment${number} [$CH${segment},$CH${segment + 25},$CH51,$CH52]`));
}
const ids = configuration.mqtt.map(entity => Object.values(entity)[0].unique_id);
assert.equal(new Set(ids).size, 29);
assert.equal(lights.length, 28);
assert(lights.every(light => light.retain === false && light.optimistic === false));

const generated = JSON.stringify(configuration, null, 2) + '\n';
if (process.argv.includes('--check')) {
    assert.equal(readFileSync(output, 'utf8'), generated);
    console.log('PASS: 28 lights + interval, unique IDs, renderer MQTT contract, generated configuration');
} else {
    writeFileSync(output, generated);
    console.log(`Generated ${output.pathname}`);
}