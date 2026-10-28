import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableToObjects } from '../js/sources.js';
import { countdown, spokenDuration } from '../js/stations.js';
import { youtubeEmbed } from '../js/views.js';

test('NOAA tables: header-row arrays and (2026+) object arrays normalise the same way', () => {
  const old = [
    ['time_tag', 'Kp', 'a_running', 'station_count'],
    ['2026-03-01 00:00:00.000', '2.33', '9', '8'],
  ];
  const now = [{ time_tag: '2026-04-01T00:00:00', Kp: 2.33, a_running: 9, station_count: 8 }];
  assert.equal(Number(tableToObjects(old)[0].Kp), 2.33);
  assert.equal(Number(tableToObjects(now)[0].Kp), 2.33);
  assert.deepEqual(tableToObjects([]), []);
  assert.deepEqual(tableToObjects(null), []);
});

test('launch countdown counts down to T-0 and up after it', () => {
  assert.equal(countdown(3723e3), 'T− 01:02:03');
  assert.equal(countdown(90061e3), 'T− 1d 01:01:01');
  assert.equal(countdown(-5e3), 'T+ 00:00:05');
});

test('spoken durations', () => {
  assert.equal(spokenDuration(0.4), 'less than a minute');
  assert.equal(spokenDuration(1), '1 minute');
  assert.equal(spokenDuration(75), '1 hour and 15 minutes');
  assert.equal(spokenDuration(120), '2 hours');
  assert.equal(spokenDuration(60 * 72), '3 days');
});

test('ISS camera setting accepts IDs and links, defaults to NASA live', () => {
  assert.match(youtubeEmbed(''), /live_stream\?channel=UCLA_DiR1FfKNvjuUpBHmylQ/);
  assert.match(youtubeEmbed('abcdefghijk'), /embed\/abcdefghijk\?/);
  assert.match(youtubeEmbed('https://www.youtube.com/watch?v=abcdefghijk&t=3'), /embed\/abcdefghijk\?/);
  assert.match(youtubeEmbed('https://youtu.be/abcdefghijk'), /embed\/abcdefghijk\?/);
  assert.match(youtubeEmbed('https://www.youtube.com/live/abcdefghijk'), /embed\/abcdefghijk\?/);
});
