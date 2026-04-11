const micBtn = document.getElementById("mic-btn");
const ttsBtn = document.getElementById("tts-btn");
const input  = document.getElementById("user-input");

// --- TTS ---
let ttsEnabled = false;
let currentAudio = null;

ttsBtn.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsBtn.textContent = ttsEnabled ? "🔊" : "🔇";
  ttsBtn.classList.toggle("active", ttsEnabled);
  if (!ttsEnabled && currentAudio) { currentAudio.pause(); currentAudio = null; }
});

export async function speak(text) {
  if (!ttsEnabled) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  try {
    const res = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
  } catch { /* silent */ }
}

// --- STT ---
// eslint-disable-next-line no-undef
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

function beep(frequency, duration, type = "sine", volume = 0.3) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration);
}

function playStartSound() { beep(440, 0.08); setTimeout(() => beep(660, 0.12), 80); }
function playStopSound()  { beep(660, 0.08); setTimeout(() => beep(440, 0.12), 80); }

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch { return; }

  audioChunks   = [];
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const form = new FormData();
    form.append("audio", blob, "audio.webm");
    try {
      const res  = await fetch("/stt", { method: "POST", body: form });
      const data = await res.json();
      if (data.text) {
        input.value = data.text;
        input.style.height = "44px";
        input.style.height = Math.min(input.scrollHeight, 160) + "px";
        input.focus();
      }
    } catch { /* silent */ }
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.title = "Click to speak";
  };

  playStartSound();
  mediaRecorder.start();
  isRecording = true;
  micBtn.classList.add("recording");
  micBtn.title = "Click to stop";
}

micBtn.addEventListener("click", () => {
  if (isRecording && mediaRecorder) { playStopSound(); mediaRecorder.stop(); }
  else startRecording();
});
