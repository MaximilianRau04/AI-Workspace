import { useState, useRef, useCallback } from "react";
import { tts, stt } from "../api/voice";

interface UseVoiceReturn {
  speakingId: number | null;
  speak: (id: number, text: string) => Promise<void>;
  isRecording: boolean;
  toggleRecording: (onResult: (text: string) => void) => void;
}

export function useVoice(): UseVoiceReturn {
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx =
        window.AudioContext ||
        ((window as any).webkitAudioContext as typeof AudioContext);
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }

  function beep(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.3,
  ): void {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* silent */
    }
  }

  function playStartSound(): void {
    beep(440, 0.08);
    setTimeout(() => beep(660, 0.12), 80);
  }
  function playStopSound(): void {
    beep(660, 0.08);
    setTimeout(() => beep(440, 0.12), 80);
  }

  const speak = useCallback(
    async (id: number, text: string): Promise<void> => {
      const wasPlayingSameId = speakingId === id;
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setSpeakingId(null);
      if (wasPlayingSameId) return;

      try {
        const blob = await tts(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        setSpeakingId(id);
        void audio.play();
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          setSpeakingId(null);
        };
      } catch {
        setSpeakingId(null);
      }
    },
    [speakingId],
  );

  const startRecording = useCallback(
    async (onResult: (text: string) => void): Promise<void> => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return;
      }

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        try {
          const data = await stt(blob);
          if (data.text) onResult(data.text);
        } catch {
          /* silent */
        }
        setIsRecording(false);
      };

      playStartSound();
      recorder.start();
      setIsRecording(true);
    },
    [],
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      playStopSound();
      mediaRecorderRef.current.stop();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRecording = useCallback(
    (onResult: (text: string) => void) => {
      if (isRecording && mediaRecorderRef.current) {
        stopRecording();
      } else {
        void startRecording(onResult);
      }
    },
    [isRecording, startRecording, stopRecording],
  );

  return { speakingId, speak, isRecording, toggleRecording };
}
