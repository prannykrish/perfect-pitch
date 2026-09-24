import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A number is the chart. Proportional figures on the value, per the viz guidance. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold" style={{ fontVariantNumeric: "normal" }}>
          {value}
        </CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
    </Card>
  );
}
