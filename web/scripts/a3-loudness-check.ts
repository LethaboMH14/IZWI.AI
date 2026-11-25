import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTool } from '../src/server/media';
import { renderClip } from '../src/server/render';
import { BIN } from '../src/server/env';
async function main() {
 const dir = mkdtempSync(path.join(tmpdir(), 'izwi-loudness-'));
 try {
  const src = path.join(dir, 'input.wav'), out = path.join(dir, 'out.mp4');
  const fixture = await runTool(BIN.ffmpeg, ['-y','-f','lavfi','-i','sine=frequency=440:duration=5','-af','volume=0.1',src], {timeoutMs: 30000});
  if (fixture.code) throw new Error(fixture.stderr);
  await renderClip({src,out,workDir:dir,startMs:0,endMs:5000,preset:'small',hasAudio:true,hasVideo:false});
  const measure = await runTool(BIN.ffmpeg,['-hide_banner','-i',out,'-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{timeoutMs:30000});
  const match = measure.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (!match) throw new Error('No measurement');
  const result = JSON.parse(match[0]);
  const lufs = Number(result.input_i);
  console.log(`Encoded fixture: ${lufs} LUFS, true peak ${result.input_tp} dBTP`);
  if (Math.abs(lufs + 14) > 1) throw new Error('Outside +/-1 LU target tolerance');
 } finally { rmSync(dir,{recursive:true,force:true}); }
}
main().catch(e => { console.error(e); process.exitCode=1; });
