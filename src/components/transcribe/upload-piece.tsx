"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadIcon, Trash2Icon } from "lucide-react";
import { deletePiece, listPieces, savePiece, type PieceSummary } from "@/lib/db/actions";
import { forgetUploadedPiece, parseMidiFile } from "@/lib/transcribe/sources";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Upload MIDI files and pick one as the source. Controlled: the caller owns the selected id. */
export function UploadPiece({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listPieces().then(setPieces).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let lastId: number | null = null;
      for (const f of Array.from(files)) {
        const piece = await parseMidiFile(f);
        if (!piece.tracks.length) {
          toast.error(`${f.name}: no notes found`);
          continue;
        }
        lastId = await savePiece(piece);
        toast.success(`${piece.name}: ${piece.tracks.length} track${piece.tracks.length === 1 ? "" : "s"}, ${piece.tracks.reduce((n, t) => n + t.notes.length, 0)} notes`);
      }
      await refresh();
      if (lastId !== null) onChange(lastId);
    } catch (err) {
      toast.error(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: number) => {
    await deletePiece(id);
    forgetUploadedPiece(id);
    if (value === id) onChange(null);
    refresh();
  };

  const items: Record<string, string> = {};
  for (const p of pieces) items[String(p.id)] = p.name;

  return (
    <div className="flex flex-col gap-2">
      <input ref={fileRef} type="file" accept=".mid,.midi,audio/midi" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <UploadIcon /> {busy ? "Reading…" : "Upload MIDI files"}
      </Button>
      {pieces.length > 0 ? (
        <>
          <Label className="text-xs text-muted-foreground">Piece</Label>
          <div className="flex items-center gap-1">
            <Select items={items} value={value !== null ? String(value) : null} onValueChange={(v) => v && onChange(Number(v))}>
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue placeholder="Choose a piece" />
              </SelectTrigger>
              <SelectContent>
                {pieces.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} · {p.trackCount} tr · {p.noteCount} notes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {value !== null && (
              <Button variant="ghost" size="icon-sm" aria-label="Delete piece" onClick={() => remove(value)}>
                <Trash2Icon />
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No uploads yet. Any .mid file works; drums are dropped.</p>
      )}
    </div>
  );
}
