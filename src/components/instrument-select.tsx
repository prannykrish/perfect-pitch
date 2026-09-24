"use client";

import { useMemo } from "react";
import { groupByFamily, INSTRUMENTS, type InstrumentDef } from "@/lib/audio/instruments";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function InstrumentSelect({
  value,
  onChange,
  instruments = INSTRUMENTS,
  className,
  size = "default",
}: {
  value: string;
  onChange: (id: string) => void;
  instruments?: InstrumentDef[];
  className?: string;
  size?: "sm" | "default";
}) {
  const { items, groups } = useMemo(() => {
    const items: Record<string, string> = {};
    for (const d of instruments) items[d.id] = d.label;
    return { items, groups: groupByFamily(instruments) };
  }, [instruments]);

  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size={size} className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-96">
        {groups.map((g) => (
          <SelectGroup key={g.family}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.items.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <span className="flex items-center gap-2">
                  {d.label}
                  {d.tier !== "clean" && (
                    <Badge variant={d.tier === "chaos" ? "destructive" : "secondary"} className="h-4 px-1 text-[10px]">
                      {d.tier}
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
