import { ComingSoon } from "@/components/coming-soon";

export default function MistakesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Find the Mistake</h1>
        <p className="text-sm text-muted-foreground">The producer-feedback drill. A melody, progression or short texture with one planted problem. Point at where it is and say what the fix is.</p>
      </div>
      <ComingSoon
        title="Detuned note, wrong note, wrong chord quality, wrong inversion, rhythm shift, drifted instrument, A/B"
        phase={5}
        description="Each problem type is toggleable. Answer on a timeline of beats plus a diagnosis selector; location and diagnosis are scored separately."
      />
    </div>
  );
}
