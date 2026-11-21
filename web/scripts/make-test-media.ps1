# Makes a synthetic test episode for end-to-end checks. Not a real recording.
# Two Windows text-to-speech voices read a short scripted conversation; FFmpeg puts it over Naledi's still.
# Output: test-media/sim_jozi-stories-ep04.mp4 (the sim_ prefix marks it as synthetic).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "test-media"
New-Item -ItemType Directory -Force $out | Out-Null
$wav = Join-Path $out "sim_ep04_voice.wav"

$host1 = "Microsoft Zira Desktop"   # Naledi
$guest = "Microsoft David Desktop"  # Thabo
$lines = @(
  @($host1, "Sawubona Mzansi, welcome back to Jozi Stories. I am Naledi, and today I am talking to Thabo about how he built a studio from one phone."),
  @($guest, "Thanks for having me. Honestly, we started with one phone and a borrowed microphone. No lights, no laptop, just a story we needed to tell."),
  @($host1, "What changed when you started posting every week?"),
  @($guest, "Consistency changed everything. People do not follow perfect videos. They follow people who show up. We posted every Thursday for a whole year."),
  @($host1, "And language? You switch between English and isiZulu all the time."),
  @($guest, "That is how we speak at home. When we added captions in isiZulu, people in the comments said they finally felt seen."),
  @($host1, "So what would you tell someone starting today with nothing but a phone?"),
  @($guest, "Start before you are ready. Your first hundred videos are your school. Nobody is watching yet, so make your mistakes now."),
  @($host1, "Start before you are ready. That is the clip right there. Thank you, Thabo. Sharp sharp.")
)

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$pb = New-Object System.Speech.Synthesis.PromptBuilder
foreach ($l in $lines) {
  $pb.StartVoice($l[0])
  $pb.AppendText($l[1])
  $pb.EndVoice()
  $pb.AppendBreak([TimeSpan]::FromMilliseconds(700))
}
$synth.Rate = 0
$synth.SetOutputToWaveFile($wav)
$synth.Speak($pb)
$synth.Dispose()

$img = Join-Path $root "public\img\naledi-wide.jpg"
$mp4 = Join-Path $out "sim_jozi-stories-ep04.mp4"
& ffmpeg -y -loglevel error -loop 1 -i $img -i $wav `
  -vf "scale=1920:-2,zoompan=z='min(zoom+0.0004,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=25,format=yuv420p" `
  -c:v libx264 -preset veryfast -crf 24 -c:a aac -b:a 128k -shortest -movflags +faststart $mp4
Remove-Item $wav
Get-Item $mp4 | Select-Object Name, Length
