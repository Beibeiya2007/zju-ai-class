import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, recordingMime, recordingName, RECORDING_LIMIT } from '../lib/capture.ts';
class Track extends EventTarget { stops = 0; stop() { this.stops++; } }
class Stream {
  tracks: Track[];
  constructor(tracks: Track[]) { this.tracks = tracks; }
  getAudioTracks() { return this.tracks.slice(0, 1); }
  getTracks() { return this.tracks; }
}
class Recorder {
  static latest: Recorder;
  static isTypeSupported(mime: string) { return mime.startsWith('audio/webm'); }
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  stream: Stream;
  constructor(stream: Stream) { this.stream = stream; Recorder.latest = this; }
  start() { this.state = 'recording'; }
  stop() { if (this.state === 'inactive') throw new Error('double stop'); this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['final']) }); this.onstop?.(); }
}
function setup() {
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: Stream });
  const stream = new Stream([new Track(), new Track()]);
  let result: File | undefined; let finishes = 0; let limits = 0;
  const session = capture(stream as unknown as MediaStream, Recorder as unknown as typeof MediaRecorder, {
    onFinish: file => { result = file; finishes++; }, onError: () => {}, onLimit: () => { limits++; },
  });
  return { session, stream, get result() { return result; }, get finishes() { return finishes; }, get limits() { return limits; } };
}
test('mime fallback preserves playable file extension', () => {
  assert.equal(recordingMime(type => type === 'audio/mp4'), 'audio/mp4');
  assert.match(recordingName('audio/mp4'), /\.m4a$/);
  assert.equal(recordingMime(() => false), '');
});
test('stop includes final data, records only audio, and releases all tracks', async () => {
  const fixture = setup();
  assert.equal(Recorder.latest.stream.getTracks().length, 1);
  Recorder.latest.ondataavailable?.({ data: new Blob(['first']) });
  fixture.session.stop(); fixture.session.stop();
  assert.equal(await fixture.result!.text(), 'firstfinal');
  assert.equal(fixture.finishes, 1);
  assert.ok(fixture.stream.tracks.every(track => track.stops === 1));
});
test('browser ending the shared source finalizes the recording', () => {
  const fixture = setup();
  fixture.stream.tracks[1].dispatchEvent(new Event('ended'));
  assert.equal(fixture.finishes, 1);
});
test('size limit finishes once and preserves received audio', () => {
  const fixture = setup();
  Recorder.latest.ondataavailable?.({ data: new Blob([new Uint8Array(RECORDING_LIMIT)]) });
  assert.equal(fixture.limits, 1);
  assert.equal(fixture.result!.size, RECORDING_LIMIT + 5);
});
test('unmount releases capture without updating the removed UI', () => {
  const fixture = setup(); fixture.session.dispose();
  assert.equal(fixture.finishes, 0);
  assert.ok(fixture.stream.tracks.every(track => track.stops >= 1));
});
