import { MidiMonitor } from "@/components/compose/midi-monitor";
import { ComingSoon } from "@/components/coming-soon";

export default function ComposePage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Head to Keys</h1>
        <p className="text-sm text-muted-foreground">
          Everything you play on the USB piano shows up here in real time. Record a take, play it back through any instrument, save it.
        </p>
      </div>
      <MidiMonitor />
      <ComingSoon
        title="Prompt drills, hum-then-play, theory drills, MIDI export"
        phase={6}
        description="Imagine four bars against a key and progression, then play in one take. Hum a line into the mic, then match it on the keys. Voicing and harmonisation drills verified from MIDI."
      />
    </div>
  );
}
