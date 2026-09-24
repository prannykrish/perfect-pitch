/**
 * Instrument registry. Every playable sound the app knows about, with a realistic
 * sounding range (MIDI numbers), a family for filtering, and a difficulty tier.
 *
 * Sources:
 *  - soundfont: General MIDI banks pre-rendered by gleitz (FluidR3_GM / MusyngKite), 128 instruments
 *  - splendid:  smplr's Splendid Grand Piano (Steinway)
 *  - epiano:    smplr's Greg Sullivan e-pianos
 *  - mallet:    VCSL mallets via smplr
 *  - versilian: Versilian Community Sample Library via smplr
 *  - mellotron: archive.org Mellotron tapes via smplr
 *  - smolken:   Smolken double bass via smplr
 *  - synth:     our own Web Audio synth presets (see synth.ts)
 */

export type InstrumentFamily =
  | "piano"
  | "chromatic-percussion"
  | "organ"
  | "guitar"
  | "bass"
  | "strings"
  | "ensemble"
  | "brass"
  | "reed"
  | "pipe"
  | "synth-lead"
  | "synth-pad"
  | "synth-fx"
  | "ethnic"
  | "percussive"
  | "sfx"
  | "electric-piano"
  | "mallet"
  | "harpsichord"
  | "harp"
  | "voice"
  | "mellotron"
  | "synth";

export const FAMILY_LABELS: Record<InstrumentFamily, string> = {
  piano: "Piano",
  "chromatic-percussion": "Chromatic percussion",
  organ: "Organ",
  guitar: "Guitar",
  bass: "Bass",
  strings: "Strings",
  ensemble: "Ensemble",
  brass: "Brass",
  reed: "Reed",
  pipe: "Pipe / Flute",
  "synth-lead": "Synth lead",
  "synth-pad": "Synth pad",
  "synth-fx": "Synth FX",
  ethnic: "World",
  percussive: "Percussive",
  sfx: "Sound effects",
  "electric-piano": "Electric piano",
  mallet: "Mallets",
  harpsichord: "Harpsichord",
  harp: "Harp",
  voice: "Voice / Choir",
  mellotron: "Mellotron",
  synth: "Synth (generated)",
};

export const FAMILY_ORDER: InstrumentFamily[] = [
  "piano",
  "electric-piano",
  "harpsichord",
  "organ",
  "chromatic-percussion",
  "mallet",
  "guitar",
  "harp",
  "bass",
  "strings",
  "ensemble",
  "voice",
  "brass",
  "reed",
  "pipe",
  "ethnic",
  "mellotron",
  "synth-lead",
  "synth-pad",
  "synth-fx",
  "synth",
  "percussive",
  "sfx",
];

/** clean: clear fundamental. hard: odd timbre, slow attack, inharmonic. chaos: barely a pitch. */
export type InstrumentTier = "clean" | "hard" | "chaos";

export type InstrumentSource =
  | { kind: "soundfont"; name: string }
  | { kind: "splendid" }
  | { kind: "epiano"; name: string }
  | { kind: "mallet"; name: string }
  | { kind: "versilian"; name: string }
  | { kind: "mellotron"; name: string }
  | { kind: "smolken"; name: string }
  | { kind: "synth"; preset: string };

export interface InstrumentDef {
  id: string;
  label: string;
  family: InstrumentFamily;
  tier: InstrumentTier;
  /** Realistic sounding range, inclusive MIDI numbers. */
  range: [number, number];
  /** False for pure noise sounds that have no identifiable fundamental. */
  pitched: boolean;
  source: InstrumentSource;
}

type GmRow = [
  name: string,
  label: string,
  family: InstrumentFamily,
  lo: number,
  hi: number,
  tier?: InstrumentTier,
  pitched?: boolean,
];

// prettier-ignore
const GM: GmRow[] = [
  // 0-7 piano
  ["acoustic_grand_piano", "Acoustic Grand Piano", "piano", 21, 108],
  ["bright_acoustic_piano", "Bright Acoustic Piano", "piano", 21, 108],
  ["electric_grand_piano", "Electric Grand Piano", "piano", 21, 108],
  ["honkytonk_piano", "Honky-tonk Piano", "piano", 21, 108, "hard"],
  ["electric_piano_1", "Electric Piano 1 (Rhodes)", "electric-piano", 28, 103],
  ["electric_piano_2", "Electric Piano 2 (FM)", "electric-piano", 28, 103],
  ["harpsichord", "Harpsichord", "harpsichord", 29, 89],
  ["clavinet", "Clavinet", "electric-piano", 41, 89],
  // 8-15 chromatic percussion
  ["celesta", "Celesta", "chromatic-percussion", 60, 108],
  ["glockenspiel", "Glockenspiel", "chromatic-percussion", 79, 108],
  ["music_box", "Music Box", "chromatic-percussion", 60, 96],
  ["vibraphone", "Vibraphone", "chromatic-percussion", 53, 89],
  ["marimba", "Marimba", "chromatic-percussion", 45, 96],
  ["xylophone", "Xylophone", "chromatic-percussion", 65, 108],
  ["tubular_bells", "Tubular Bells", "chromatic-percussion", 60, 77, "hard"],
  ["dulcimer", "Dulcimer", "chromatic-percussion", 55, 89],
  // 16-23 organ
  ["drawbar_organ", "Drawbar Organ", "organ", 36, 96],
  ["percussive_organ", "Percussive Organ", "organ", 36, 96],
  ["rock_organ", "Rock Organ", "organ", 36, 96],
  ["church_organ", "Church Organ", "organ", 36, 96],
  ["reed_organ", "Reed Organ", "organ", 36, 96],
  ["accordion", "Accordion", "organ", 53, 89],
  ["harmonica", "Harmonica", "organ", 60, 84],
  ["tango_accordion", "Tango Accordion", "organ", 53, 89],
  // 24-31 guitar
  ["acoustic_guitar_nylon", "Nylon Guitar", "guitar", 40, 88],
  ["acoustic_guitar_steel", "Steel Guitar", "guitar", 40, 88],
  ["electric_guitar_jazz", "Jazz Guitar", "guitar", 40, 88],
  ["electric_guitar_clean", "Clean Electric Guitar", "guitar", 40, 88],
  ["electric_guitar_muted", "Muted Electric Guitar", "guitar", 40, 88, "hard"],
  ["overdriven_guitar", "Overdriven Guitar", "guitar", 40, 88],
  ["distortion_guitar", "Distortion Guitar", "guitar", 40, 88, "hard"],
  ["guitar_harmonics", "Guitar Harmonics", "guitar", 52, 88, "hard"],
  // 32-39 bass
  ["acoustic_bass", "Acoustic Bass", "bass", 28, 67],
  ["electric_bass_finger", "Electric Bass (finger)", "bass", 28, 67],
  ["electric_bass_pick", "Electric Bass (pick)", "bass", 28, 67],
  ["fretless_bass", "Fretless Bass", "bass", 28, 67],
  ["slap_bass_1", "Slap Bass 1", "bass", 28, 67, "hard"],
  ["slap_bass_2", "Slap Bass 2", "bass", 28, 67, "hard"],
  ["synth_bass_1", "Synth Bass 1", "bass", 24, 60],
  ["synth_bass_2", "Synth Bass 2", "bass", 24, 60],
  // 40-47 strings
  ["violin", "Violin", "strings", 55, 100],
  ["viola", "Viola", "strings", 48, 88],
  ["cello", "Cello", "strings", 36, 81],
  ["contrabass", "Contrabass", "strings", 28, 55],
  ["tremolo_strings", "Tremolo Strings", "strings", 36, 96, "hard"],
  ["pizzicato_strings", "Pizzicato Strings", "strings", 36, 96],
  ["orchestral_harp", "Orchestral Harp", "harp", 24, 103],
  ["timpani", "Timpani", "percussive", 38, 57, "hard"],
  // 48-55 ensemble
  ["string_ensemble_1", "String Ensemble 1", "ensemble", 36, 96],
  ["string_ensemble_2", "String Ensemble 2", "ensemble", 36, 96],
  ["synth_strings_1", "Synth Strings 1", "ensemble", 36, 96],
  ["synth_strings_2", "Synth Strings 2", "ensemble", 36, 96],
  ["choir_aahs", "Choir Aahs", "voice", 48, 84],
  ["voice_oohs", "Voice Oohs", "voice", 48, 84],
  ["synth_choir", "Synth Choir", "voice", 48, 84],
  ["orchestra_hit", "Orchestra Hit", "ensemble", 48, 72, "chaos"],
  // 56-63 brass
  ["trumpet", "Trumpet", "brass", 52, 84],
  ["trombone", "Trombone", "brass", 40, 77],
  ["tuba", "Tuba", "brass", 26, 65],
  ["muted_trumpet", "Muted Trumpet", "brass", 52, 84],
  ["french_horn", "French Horn", "brass", 41, 77],
  ["brass_section", "Brass Section", "brass", 40, 84],
  ["synth_brass_1", "Synth Brass 1", "brass", 36, 84],
  ["synth_brass_2", "Synth Brass 2", "brass", 36, 84],
  // 64-71 reed
  ["soprano_sax", "Soprano Sax", "reed", 56, 88],
  ["alto_sax", "Alto Sax", "reed", 49, 81],
  ["tenor_sax", "Tenor Sax", "reed", 44, 76],
  ["baritone_sax", "Baritone Sax", "reed", 36, 69],
  ["oboe", "Oboe", "reed", 58, 93],
  ["english_horn", "English Horn", "reed", 52, 81],
  ["bassoon", "Bassoon", "reed", 34, 75],
  ["clarinet", "Clarinet", "reed", 50, 94],
  // 72-79 pipe
  ["piccolo", "Piccolo", "pipe", 74, 108],
  ["flute", "Flute", "pipe", 60, 96],
  ["recorder", "Recorder", "pipe", 60, 96],
  ["pan_flute", "Pan Flute", "pipe", 60, 96],
  ["blown_bottle", "Blown Bottle", "pipe", 55, 84, "hard"],
  ["shakuhachi", "Shakuhachi", "pipe", 55, 84, "hard"],
  ["whistle", "Whistle", "pipe", 72, 96],
  ["ocarina", "Ocarina", "pipe", 60, 84],
  // 80-87 synth lead
  ["lead_1_square", "Lead 1 (square)", "synth-lead", 36, 96],
  ["lead_2_sawtooth", "Lead 2 (sawtooth)", "synth-lead", 36, 96],
  ["lead_3_calliope", "Lead 3 (calliope)", "synth-lead", 36, 96],
  ["lead_4_chiff", "Lead 4 (chiff)", "synth-lead", 36, 96],
  ["lead_5_charang", "Lead 5 (charang)", "synth-lead", 36, 96, "hard"],
  ["lead_6_voice", "Lead 6 (voice)", "synth-lead", 36, 96],
  ["lead_7_fifths", "Lead 7 (fifths)", "synth-lead", 36, 96, "chaos"],
  ["lead_8_bass__lead", "Lead 8 (bass + lead)", "synth-lead", 36, 96, "hard"],
  // 88-95 synth pad
  ["pad_1_new_age", "Pad 1 (new age)", "synth-pad", 36, 96, "hard"],
  ["pad_2_warm", "Pad 2 (warm)", "synth-pad", 36, 96],
  ["pad_3_polysynth", "Pad 3 (polysynth)", "synth-pad", 36, 96],
  ["pad_4_choir", "Pad 4 (choir)", "synth-pad", 36, 96],
  ["pad_5_bowed", "Pad 5 (bowed)", "synth-pad", 36, 96, "hard"],
  ["pad_6_metallic", "Pad 6 (metallic)", "synth-pad", 36, 96, "hard"],
  ["pad_7_halo", "Pad 7 (halo)", "synth-pad", 36, 96, "hard"],
  ["pad_8_sweep", "Pad 8 (sweep)", "synth-pad", 36, 96, "hard"],
  // 96-103 synth fx
  ["fx_1_rain", "FX 1 (rain)", "synth-fx", 36, 96, "chaos"],
  ["fx_2_soundtrack", "FX 2 (soundtrack)", "synth-fx", 36, 96, "hard"],
  ["fx_3_crystal", "FX 3 (crystal)", "synth-fx", 36, 96, "hard"],
  ["fx_4_atmosphere", "FX 4 (atmosphere)", "synth-fx", 36, 96, "hard"],
  ["fx_5_brightness", "FX 5 (brightness)", "synth-fx", 36, 96, "hard"],
  ["fx_6_goblins", "FX 6 (goblins)", "synth-fx", 36, 96, "chaos"],
  ["fx_7_echoes", "FX 7 (echoes)", "synth-fx", 36, 96, "hard"],
  ["fx_8_scifi", "FX 8 (sci-fi)", "synth-fx", 36, 96, "chaos"],
  // 104-111 ethnic
  ["sitar", "Sitar", "ethnic", 48, 84],
  ["banjo", "Banjo", "ethnic", 48, 84],
  ["shamisen", "Shamisen", "ethnic", 50, 86],
  ["koto", "Koto", "ethnic", 48, 84],
  ["kalimba", "Kalimba", "ethnic", 60, 84],
  ["bagpipe", "Bagpipe", "ethnic", 55, 79, "hard"],
  ["fiddle", "Fiddle", "ethnic", 55, 100],
  ["shanai", "Shanai", "ethnic", 60, 84, "hard"],
  // 112-119 percussive
  ["tinkle_bell", "Tinkle Bell", "percussive", 72, 108, "hard"],
  ["agogo", "Agogo", "percussive", 60, 84, "chaos"],
  ["steel_drums", "Steel Drums", "percussive", 55, 91],
  ["woodblock", "Woodblock", "percussive", 60, 84, "chaos"],
  ["taiko_drum", "Taiko Drum", "percussive", 36, 60, "chaos"],
  ["melodic_tom", "Melodic Tom", "percussive", 36, 72, "chaos"],
  ["synth_drum", "Synth Drum", "percussive", 36, 72, "chaos"],
  ["reverse_cymbal", "Reverse Cymbal", "percussive", 48, 84, "chaos", false],
  // 120-127 sound effects
  ["guitar_fret_noise", "Guitar Fret Noise", "sfx", 48, 84, "chaos", false],
  ["breath_noise", "Breath Noise", "sfx", 48, 84, "chaos", false],
  ["seashore", "Seashore", "sfx", 48, 84, "chaos", false],
  ["bird_tweet", "Bird Tweet", "sfx", 60, 96, "chaos"],
  ["telephone_ring", "Telephone Ring", "sfx", 48, 84, "chaos"],
  ["helicopter", "Helicopter", "sfx", 36, 72, "chaos", false],
  ["applause", "Applause", "sfx", 48, 84, "chaos", false],
  ["gunshot", "Gunshot", "sfx", 48, 84, "chaos", false],
];

export const GM_NAMES: string[] = GM.map((r) => r[0]);

function gm(kit: "FluidR3_GM" | "MusyngKite"): InstrumentDef[] {
  const prefix = kit === "FluidR3_GM" ? "gm" : "mk";
  const suffix = kit === "FluidR3_GM" ? "" : " (MusyngKite)";
  return GM.map(([name, label, family, lo, hi, tier = "clean", pitched = true]) => ({
    id: `${prefix}:${name}`,
    label: `${label}${suffix}`,
    family,
    tier,
    range: [lo, hi],
    pitched,
    source: { kind: "soundfont", name },
  }));
}

const PREMIUM: InstrumentDef[] = [
  {
    id: "splendid:grand",
    label: "Splendid Grand Piano (Steinway)",
    family: "piano",
    tier: "clean",
    range: [21, 108],
    pitched: true,
    source: { kind: "splendid" },
  },
  ...(
    [
      ["CP80", "Yamaha CP80", 28, 103],
      ["PianetT", "Hohner Pianet T", 41, 89],
      ["WurlitzerEP200", "Wurlitzer EP200", 28, 96],
      ["TX81Z", "Yamaha TX81Z FM Piano", 36, 96],
    ] as [string, string, number, number][]
  ).map(([name, label, lo, hi]) => ({
    id: `ep:${name}`,
    label,
    family: "electric-piano" as const,
    tier: "clean" as const,
    range: [lo, hi] as [number, number],
    pitched: true,
    source: { kind: "epiano" as const, name },
  })),
  ...(
    [
      ["Balafon - Hard Mallet", "Balafon (hard mallet)", 53, 89, "clean"],
      ["Balafon - Soft Mallet", "Balafon (soft mallet)", 53, 89, "clean"],
      ["Balafon - Traditional Mallet", "Balafon (traditional)", 53, 89, "clean"],
      ["Tubular Bells 1", "Tubular Bells 1 (VCSL)", 60, 77, "hard"],
      ["Tubular Bells 2", "Tubular Bells 2 (VCSL)", 60, 77, "hard"],
      ["Vibraphone - Bowed", "Vibraphone (bowed)", 53, 89, "hard"],
      ["Vibraphone - Hard Mallets", "Vibraphone (hard mallets)", 53, 89, "clean"],
      ["Vibraphone - Soft Mallets", "Vibraphone (soft mallets)", 53, 89, "clean"],
      ["Xylophone - Hard Mallets", "Xylophone (hard mallets)", 65, 108, "clean"],
      ["Xylophone - Medium Mallets", "Xylophone (medium mallets)", 65, 108, "clean"],
      ["Xylophone - Soft Mallets", "Xylophone (soft mallets)", 65, 108, "clean"],
    ] as [string, string, number, number, InstrumentTier][]
  ).map(([name, label, lo, hi, tier]) => ({
    id: `mallet:${name}`,
    label,
    family: "mallet" as const,
    tier,
    range: [lo, hi] as [number, number],
    pitched: true,
    source: { kind: "mallet" as const, name },
  })),
  ...(
    [
      ["Arco", "Double Bass (arco)", 28, 67],
      ["Pizzicato", "Double Bass (pizzicato)", 28, 67],
    ] as [string, string, number, number][]
  ).map(([name, label, lo, hi]) => ({
    id: `smolken:${name}`,
    label,
    family: "bass" as const,
    tier: "clean" as const,
    range: [lo, hi] as [number, number],
    pitched: true,
    source: { kind: "smolken" as const, name },
  })),
];

// Mellotron tapes cover G2-F5 (35 notes). All are "hard" because of the tape character.
const MELLOTRON_NAMES = [
  "300 STRINGS CELLO", "300 STRINGS VIOLA", "8VOICE CHOIR", "BASSA+STRNGS", "BOYS CHOIR",
  "CHA CHA FLT", "CHM CLARINET", "CHMB 3 VLNS", "CHMB ALTOSAX", "CHMB FEMALE", "CHMB MALE VC",
  "CHMB TNR SAX", "CHMB TRMBONE", "CHMB TRUMPET", "CHMBLN CELLO", "CHMBLN FLUTE", "CHMBLN OBOE",
  "DIXIE+TRMBN", "FOXTROT+SAX", "HALFSP.BRASS", "MIXED STRGS", "MKII BRASS", "MKII GUITAR",
  "MKII ORGAN", "MKII SAX", "MKII VIBES", "MKII VIOLINS", "MOVE BS+STGS", "STRGS+BRASS",
  "TROMB+TRMPT", "TRON 16VLNS", "TRON CELLO", "TRON FLUTE", "TRON VIOLA",
];

const MELLOTRON: InstrumentDef[] = MELLOTRON_NAMES.map((name) => ({
  id: `mellotron:${name}`,
  label: `Mellotron ${name.replace(/\+/g, " + ")}`,
  family: "mellotron",
  tier: "hard",
  range: [55, 89],
  pitched: true,
  source: { kind: "mellotron", name },
}));

type VRow = [path: string, label: string, family: InstrumentFamily, lo: number, hi: number, tier?: InstrumentTier, pitched?: boolean];

// Curated pitched subset of the Versilian Community Sample Library.
// prettier-ignore
const VERSILIAN_ROWS: VRow[] = [
  ["Chordophones/Zithers/Grand Piano, Kawai", "Kawai Grand Piano", "piano", 21, 108],
  ["Chordophones/Zithers/Grand Piano, Steinway B", "Steinway B Grand Piano", "piano", 21, 108],
  ["Chordophones/Zithers/Upright Piano, Knight", "Knight Upright Piano", "piano", 21, 108],
  ["Chordophones/Zithers/Upright Piano, Yamaha", "Yamaha Upright Piano", "piano", 21, 108],
  ["Chordophones/Zithers/Harpsichord, Italian", "Italian Harpsichord", "harpsichord", 29, 89],
  ["Chordophones/Zithers/Harpsichord, French", "French Harpsichord", "harpsichord", 29, 89],
  ["Chordophones/Zithers/Harpsichord, Flemish - 8'", "Flemish Harpsichord 8'", "harpsichord", 29, 89],
  ["Chordophones/Zithers/Harpsichord, Flemish - 4'", "Flemish Harpsichord 4'", "harpsichord", 29, 89, "hard"],
  ["Chordophones/Zithers/Harpsichord, Flemish - Full", "Flemish Harpsichord (full)", "harpsichord", 29, 89],
  ["Chordophones/Zithers/Harpsichord, English - Normal", "English Harpsichord", "harpsichord", 29, 89],
  ["Chordophones/Zithers/Harpsichord, English - Lute", "English Harpsichord (lute stop)", "harpsichord", 29, 89, "hard"],
  ["Chordophones/Zithers/Dan Tranh - Normal", "Đàn tranh", "ethnic", 48, 84, "hard"],
  ["Chordophones/Zithers/Dan Tranh - Vibrato", "Đàn tranh (vibrato)", "ethnic", 48, 84, "hard"],
  ["Chordophones/Zithers/Psaltery, Bowed and Plucked - Pluck", "Psaltery (plucked)", "ethnic", 48, 84],
  ["Chordophones/Zithers/Psaltery, Bowed and Plucked - LongBow", "Psaltery (bowed)", "ethnic", 48, 84, "hard"],
  ["Chordophones/Composite Chordophones/Folk Harp", "Folk Harp", "harp", 36, 91],
  ["Chordophones/Composite Chordophones/Concert Harp", "Concert Harp", "harp", 24, 103],
  ["Chordophones/Composite Chordophones/Strumstick", "Strumstick", "ethnic", 50, 86, "hard"],
  ["Electrophones/TX81Z - Piano 1", "TX81Z Piano 1", "electric-piano", 36, 96],
  ["Electrophones/TX81Z - Clavisynth", "TX81Z Clavisynth", "electric-piano", 36, 96, "hard"],
  ["Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Normal", "Chromatic Harmonica (Super 64)", "organ", 48, 96],
  ["Aerophones/Free Aerophones/Harmonica-Hohner-Super64 - Vib", "Chromatic Harmonica (vibrato)", "organ", 48, 96, "hard"],
  ["Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Normal", "Blues Harmonica in C", "organ", 60, 84],
  ["Aerophones/Free Aerophones/Harmonica-Hohner-Special20-F - Normal", "Blues Harmonica in F", "organ", 65, 89],
  ["Aerophones/Free Aerophones/Siren", "Siren", "sfx", 60, 84, "chaos"],
  ["Aerophones/Reed Aerophones/Tenor Saxophone - Non-Vibrato", "Tenor Sax (VCSL)", "reed", 44, 76],
  ["Aerophones/Reed Aerophones/Tenor Saxophone - Vibrato", "Tenor Sax (vibrato)", "reed", 44, 76, "hard"],
  ["Aerophones/Reed Aerophones/Saxello - Non-Vibrato", "Saxello", "reed", 56, 88],
  ["Aerophones/Reed Aerophones/Saxello - Vibrato", "Saxello (vibrato)", "reed", 56, 88, "hard"],
  ["Aerophones/Lip Aerophones/Didgeridoo", "Didgeridoo", "ethnic", 36, 50, "chaos"],
  ["Aerophones/Edge-blown Aerophones/Renaissance Organ - 8'", "Renaissance Organ 8'", "organ", 36, 96],
  ["Aerophones/Edge-blown Aerophones/Renaissance Organ - 4'", "Renaissance Organ 4'", "organ", 36, 96, "hard"],
  ["Aerophones/Edge-blown Aerophones/Renaissance Organ - Full", "Renaissance Organ (full)", "organ", 36, 96],
  ["Aerophones/Edge-blown Aerophones/Pipe Organ - Loud", "Pipe Organ (loud)", "organ", 36, 96],
  ["Aerophones/Edge-blown Aerophones/Pipe Organ - Quiet", "Pipe Organ (quiet)", "organ", 36, 96],
  ["Aerophones/Edge-blown Aerophones/Pipe Organ - Quiet Pedal", "Pipe Organ pedals (quiet)", "organ", 24, 55, "hard"],
  ["Aerophones/Edge-blown Aerophones/Pipe Organ - Loud Pedal", "Pipe Organ pedals (loud)", "organ", 24, 55, "hard"],
  ["Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder - Sustain", "Soprano Recorder", "pipe", 72, 98],
  ["Aerophones/Edge-blown Aerophones/Baroque Alto Recorder - Sustain", "Alto Recorder", "pipe", 65, 91],
  ["Aerophones/Edge-blown Aerophones/Baroque Tenor Recorder - Sustain", "Tenor Recorder", "pipe", 60, 86],
  ["Aerophones/Edge-blown Aerophones/Baroque Bass Recorder - Sustain", "Bass Recorder", "pipe", 53, 79],
  ["Aerophones/Edge-blown Aerophones/Baroque Alto Recorder - SusVib", "Alto Recorder (vibrato)", "pipe", 65, 91, "hard"],
  ["Aerophones/Edge-blown Aerophones/Ocarina, Typical - Sus", "Ocarina", "pipe", 60, 84],
  ["Aerophones/Edge-blown Aerophones/Ocarina, Small - Sustain", "Small Ocarina", "pipe", 72, 96, "hard"],
  ["Aerophones/Edge-blown Aerophones/Ball Whistle", "Ball Whistle", "sfx", 72, 96, "chaos"],
  ["Aerophones/Edge-blown Aerophones/Train Whistle, Toy", "Toy Train Whistle", "sfx", 60, 84, "chaos"],
  ["Idiophones/Plucked Idiophones/Kalimba, Kenya", "Kalimba (Kenya)", "ethnic", 60, 84],
  ["Idiophones/Plucked Idiophones/Kalimba, Tanzania", "Kalimba (Tanzania)", "ethnic", 60, 84],
  ["Idiophones/Plucked Idiophones/Mbira Mavembe (Gandanga), Zimbabwe, Low G", "Mbira Mavembe", "ethnic", 55, 79, "hard"],
  ["Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B", "Mbira dzaVadzimu", "ethnic", 55, 79, "hard"],
  ["Idiophones/Plucked Idiophones/Nyunga Nyunga, Mozambique, Low F", "Nyunga Nyunga", "ethnic", 53, 77, "hard"],
  ["Idiophones/Struck Idiophones/Glockenspiel", "Glockenspiel (VCSL)", "chromatic-percussion", 79, 108],
  ["Idiophones/Struck Idiophones/Tubular Glockenspiel", "Tubular Glockenspiel", "chromatic-percussion", 72, 103, "hard"],
  ["Idiophones/Struck Idiophones/Marimba", "Marimba (VCSL)", "chromatic-percussion", 45, 96],
  ["Idiophones/Struck Idiophones/Hand Bells, Nepalese", "Nepalese Hand Bells", "chromatic-percussion", 60, 84, "hard"],
  ["Idiophones/Struck Idiophones/Hand Chimes", "Hand Chimes", "chromatic-percussion", 60, 96],
  ["Idiophones/Struck Idiophones/Bell Tree - Individual", "Bell Tree", "chromatic-percussion", 72, 103, "hard"],
  ["Idiophones/Friction Idiophones/Wine Glasses - Slow", "Wine Glasses (slow)", "chromatic-percussion", 60, 96, "hard"],
  ["Idiophones/Friction Idiophones/Wine Glasses - Fast", "Wine Glasses (fast)", "chromatic-percussion", 60, 96, "hard"],
  ["Idiophones/Struck Idiophones/Gong 1", "Gong 1", "percussive", 48, 72, "chaos"],
  // "Gong 2" is left out: every one of its samples is missing from the CDN (2026-09-24).
  ["Idiophones/Struck Idiophones/Anvil", "Anvil", "percussive", 60, 84, "chaos"],
  ["Idiophones/Struck Idiophones/Triangles", "Triangles", "percussive", 72, 96, "chaos"],
  ["Idiophones/Struck Idiophones/Cowbells", "Cowbells", "percussive", 60, 84, "chaos"],
  ["Idiophones/Struck Idiophones/Agogo Bells", "Agogo Bells (VCSL)", "percussive", 60, 84, "chaos"],
  ["Idiophones/Struck Idiophones/Brake Drum", "Brake Drum", "percussive", 48, 72, "chaos"],
  ["Idiophones/Struck Idiophones/Flexatone", "Flexatone", "percussive", 60, 84, "chaos"],
  ["Idiophones/Struck Idiophones/Woodblock", "Woodblock (VCSL)", "percussive", 60, 84, "chaos"],
  ["Idiophones/Struck Idiophones/Slit Drum", "Slit Drum", "percussive", 48, 72, "chaos"],
  ["Idiophones/Struck Idiophones/Claves", "Claves", "percussive", 60, 84, "chaos"],
  ["Membranophones/Struck Membranophones/Timpani 1 - Hit", "Timpani (VCSL)", "percussive", 38, 57, "hard"],
  ["Membranophones/Struck Membranophones/Timpani 2 - Scale", "Timpani 2 (VCSL)", "percussive", 38, 57, "hard"],
  ["Membranophones/Struck Membranophones/Tom 1", "Tom 1", "percussive", 36, 60, "chaos"],
  ["Membranophones/Struck Membranophones/Bongos", "Bongos", "percussive", 48, 72, "chaos"],
  ["Membranophones/Struck Membranophones/Conga", "Conga", "percussive", 36, 60, "chaos"],
  ["Membranophones/Struck Membranophones/Darbuka", "Darbuka", "percussive", 48, 72, "chaos"],
];

const VERSILIAN: InstrumentDef[] = VERSILIAN_ROWS.map(
  ([path, label, family, lo, hi, tier = "clean", pitched = true]) => ({
    id: `vcsl:${path}`,
    label,
    family,
    tier,
    range: [lo, hi],
    pitched,
    source: { kind: "versilian", name: path },
  })
);

/** Synth presets are defined in synth.ts; the registry only needs ids and metadata. */
export const SYNTH_PRESETS: { preset: string; label: string; tier: InstrumentTier; range: [number, number] }[] = [
  { preset: "sine", label: "Sine wave", tier: "clean", range: [24, 108] },
  { preset: "triangle", label: "Triangle wave", tier: "clean", range: [24, 108] },
  { preset: "square", label: "Square wave", tier: "clean", range: [24, 108] },
  { preset: "sawtooth", label: "Sawtooth wave", tier: "clean", range: [24, 108] },
  { preset: "organ", label: "Additive organ", tier: "clean", range: [24, 108] },
  { preset: "fm-bell", label: "FM bell", tier: "hard", range: [36, 108] },
  { preset: "fm-metal", label: "FM metallic", tier: "hard", range: [36, 96] },
  { preset: "pluck", label: "Filtered pluck", tier: "clean", range: [24, 108] },
  { preset: "pitched-noise", label: "Pitched noise", tier: "hard", range: [36, 96] },
  { preset: "inharmonic", label: "Inharmonic bell", tier: "chaos", range: [36, 96] },
  { preset: "glide", label: "Glide-in tone", tier: "hard", range: [24, 108] },
  { preset: "random", label: "Random synth (new sound every note)", tier: "chaos", range: [24, 108] },
];

const SYNTH: InstrumentDef[] = SYNTH_PRESETS.map((p) => ({
  id: `synth:${p.preset}`,
  label: p.label,
  family: "synth",
  tier: p.tier,
  range: p.range,
  pitched: true,
  source: { kind: "synth", preset: p.preset },
}));

export const INSTRUMENTS: InstrumentDef[] = [
  ...PREMIUM,
  ...gm("FluidR3_GM"),
  ...MELLOTRON,
  ...VERSILIAN,
  ...SYNTH,
];

const BY_ID = new Map(INSTRUMENTS.map((d) => [d.id, d]));

export function getInstrument(id: string): InstrumentDef | undefined {
  return BY_ID.get(id);
}

export function instrumentLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Local, mp3-based, works offline and in every browser. The sampled Steinway ("splendid:grand") streams from a CDN. */
export const DEFAULT_INSTRUMENT_ID = "gm:acoustic_grand_piano";

export interface InstrumentFilter {
  families?: InstrumentFamily[]; // empty/undefined = all
  tiers?: InstrumentTier[]; // empty/undefined = all
  pitchedOnly?: boolean;
}

export function filterInstruments(filter: InstrumentFilter): InstrumentDef[] {
  return INSTRUMENTS.filter((d) => {
    if (filter.pitchedOnly && !d.pitched) return false;
    if (filter.families?.length && !filter.families.includes(d.family)) return false;
    if (filter.tiers?.length && !filter.tiers.includes(d.tier)) return false;
    return true;
  });
}

export function groupByFamily(defs: InstrumentDef[]): { family: InstrumentFamily; label: string; items: InstrumentDef[] }[] {
  const groups = new Map<InstrumentFamily, InstrumentDef[]>();
  for (const d of defs) {
    if (!groups.has(d.family)) groups.set(d.family, []);
    groups.get(d.family)!.push(d);
  }
  return FAMILY_ORDER.filter((f) => groups.has(f)).map((f) => ({
    family: f,
    label: FAMILY_LABELS[f],
    items: groups.get(f)!,
  }));
}
