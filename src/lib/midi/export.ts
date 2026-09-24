"use client";

/** Turn a recorded take into a Standard MIDI File and hand it to the browser as a download. */
import type { RecordedNote } from "./recorder";
import { toMidiNotes } from "./take-tools";

export async function takeToMidiBytes(notes: RecordedNote[], bpm: number, name: string): Promise<Uint8Array> {
  const { Midi } = await import("@tonejs/midi");
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.name = name;
  const track = midi.addTrack();
  track.name = name;
  for (const n of toMidiNotes(notes)) track.addNote(n);
  return midi.toArray();
}

export async function downloadTakeAsMidi(notes: RecordedNote[], bpm: number, name: string): Promise<void> {
  const bytes = await takeToMidiBytes(notes, bpm, name);
  const blob = new Blob([bytes as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "take"}.mid`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
