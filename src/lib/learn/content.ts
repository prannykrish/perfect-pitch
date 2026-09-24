/**
 * The Learn tab: music theory written for someone who already hears everything and wants the words,
 * structures and reasons. Every lesson links to the drills that train it and carries playable
 * examples (MIDI numbers, 60 = C4). Pure data.
 */

export interface ExampleStep {
  /** Notes sounding together in this step. */
  midis: number[];
  /** Cents applied to every note of the step. */
  detune?: number;
  /** Length of the step in ms (default 700). */
  ms?: number;
}

export interface Example {
  label: string;
  steps: ExampleStep[];
}

export interface Term {
  term: string;
  definition: string;
}

export interface Section {
  heading: string;
  body: string[];
  examples?: Example[];
  terms?: Term[];
}

export interface Drill {
  label: string;
  href: string;
  hint: string;
}

export type LessonArea = "foundations" | "harmony" | "hearing" | "practice";

export interface Lesson {
  id: string;
  title: string;
  area: LessonArea;
  summary: string;
  sections: Section[];
  drills: Drill[];
  /** Skill id on the Progress tab. */
  skill?: string;
}

export const LESSON_AREA_LABELS: Record<LessonArea, string> = { foundations: "Foundations", harmony: "Harmony", hearing: "Hearing and sound", practice: "Practice" };

const C4 = 60;
const seq = (label: string, midis: number[], ms = 450): Example => ({ label, steps: midis.map((m) => ({ midis: [m], ms })) });
const chord = (label: string, midis: number[], ms = 1400): Example => ({ label, steps: [{ midis, ms }] });
const chords = (label: string, groups: number[][], ms = 1100): Example => ({ label, steps: groups.map((g) => ({ midis: g, ms })) });

export const LESSONS: Lesson[] = [
  {
    id: "notes-and-pitch",
    title: "Notes, pitch classes and octaves",
    area: "foundations",
    summary: "What a note name actually refers to, why C4 and C5 feel like the same note, and how the app counts notes.",
    skill: "pitch",
    sections: [
      {
        heading: "Pitch is a frequency; a note is a label",
        body: [
          "A pitch is how fast the air vibrates: A4 is 440 vibrations per second (hertz). Every time the frequency doubles you go up one octave, so A5 is 880 Hz and A3 is 220 Hz. Because doubling feels like 'the same note, higher', music names pitches in a cycle of twelve and then repeats.",
          "The twelve names inside one octave are the pitch classes: C, C♯/D♭, D, D♯/E♭, E, F, F♯/G♭, G, G♯/A♭, A, A♯/B♭, B. Two names for one sound (C♯ and D♭) are enharmonic: same key on the piano, different spelling depending on the key you are in. When you say 'that is an E♭', you are naming a pitch class; when you say 'E♭4' you are also placing the octave.",
        ],
        examples: [seq("A3, A4, A5: the same pitch class an octave apart", [57, 69, 81], 600), seq("All twelve pitch classes from C4", [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71], 260)],
        terms: [
          { term: "Pitch", definition: "How high or low a sound is; physically, its fundamental frequency in hertz." },
          { term: "Pitch class", definition: "A note name regardless of octave: every C is the pitch class C." },
          { term: "Octave", definition: "The interval between a pitch and the pitch with double its frequency; the same note name, twelve semitones up." },
          { term: "Enharmonic", definition: "Two spellings of the same sound, such as C♯ and D♭." },
        ],
      },
      {
        heading: "Octave numbers and MIDI numbers",
        body: [
          "Scientific pitch notation numbers octaves from C: C4 is middle C, and the octave number changes at every C (B3 is followed by C4). A standard 88-key piano runs from A0 to C8.",
          "Inside the app every note is a MIDI number: middle C is 60, each semitone adds one, so A4 is 69, C5 is 72, A0 is 21 and C8 is 108. The formula is MIDI = 12 × (octave + 1) + pitch class, where C = 0 … B = 11. Stats, logs and the piano roll all use these numbers.",
        ],
        examples: [seq("C4 (60), C5 (72), C6 (84)", [60, 72, 84], 600)],
        terms: [
          { term: "MIDI number", definition: "An integer for each semitone; 60 is middle C (C4), 69 is A4 = 440 Hz." },
          { term: "Middle C", definition: "C4, MIDI 60, near the middle of the piano keyboard." },
        ],
      },
      {
        heading: "Why the octave is the hard part for absolute pitch",
        body: [
          "Absolute pitch tends to deliver the pitch class instantly and the octave a beat later, and octave errors go up on sounds whose overtones are unusual (bells, some synths, very low or very high registers). That is why the trainer's default answer mode asks for pitch and octave, and why the Stats tab shows accuracy per octave separately.",
          "Two things help: a sense of register in your body (where you would sing or hum it) and knowing an instrument's normal range, which is what the 'realistic range' setting encodes.",
        ],
      },
    ],
    drills: [
      { label: "Single note, pitch + octave", href: "/trainer?mode=single", hint: "Chromatic, full range, random instrument each question." },
      { label: "Cents (how far off)", href: "/trainer?mode=cents", hint: "Once pitch class is automatic, start refining tuning." },
    ],
  },
  {
    id: "intervals",
    title: "Intervals",
    area: "foundations",
    summary: "Naming the distance between two notes, which is a different skill from naming the notes.",
    skill: "intervals",
    sections: [
      {
        heading: "Counting in semitones",
        body: [
          "An interval is the distance between two pitches, counted in semitones (piano keys). The names come from staff steps, which is why they look like ordinals: a 'third' spans three letter names (C–D–E), and its quality (major or minor) says how many semitones that is.",
          "Simple intervals within an octave: minor 2nd (1 semitone), major 2nd (2), minor 3rd (3), major 3rd (4), perfect 4th (5), tritone (6, also augmented 4th or diminished 5th), perfect 5th (7), minor 6th (8), major 6th (9), minor 7th (10), major 7th (11), octave (12).",
        ],
        examples: [
          seq("Minor 2nd, major 2nd, minor 3rd, major 3rd from C4", [60, 61, 60, 62, 60, 63, 60, 64], 380),
          seq("Perfect 4th, tritone, perfect 5th from C4", [60, 65, 60, 66, 60, 67], 380),
          seq("Minor 6th, major 6th, minor 7th, major 7th, octave from C4", [60, 68, 60, 69, 60, 70, 60, 71, 60, 72], 380),
        ],
        terms: [
          { term: "Interval", definition: "The distance between two pitches, named by staff steps and quality; measured in semitones." },
          { term: "Semitone", definition: "The smallest step in Western tuning: one piano key, 100 cents." },
          { term: "Tritone", definition: "Six semitones, half an octave: the augmented 4th / diminished 5th, the most unstable simple interval." },
          { term: "Perfect interval", definition: "Unison, 4th, 5th and octave, whose consonance survives inversion: a P5 flipped is a P4." },
        ],
      },
      {
        heading: "Melodic and harmonic",
        body: [
          "The same two notes can be melodic (one after the other) or harmonic (together). Harmonic intervals have a colour of their own: the perfect fifth is hollow and stable, the major third is warm, the minor second grinds, the tritone pulls. In the trainer, 'harmonic' plays both notes at once; 'melodic' plays them in order, up or down.",
          "With absolute pitch you can always work an interval out by naming both notes and subtracting. The trainer's intervals mode is there so you also learn the interval's own sound, which is what lets you reduce a chord or a texture in one hearing instead of note by note.",
        ],
        examples: [chord("Harmonic perfect 5th, C4 + G4", [60, 67]), chord("Harmonic major 3rd, C4 + E4", [60, 64]), chord("Harmonic tritone, C4 + F♯4", [60, 66]), chord("Harmonic minor 2nd, C4 + C♯4", [60, 61])],
      },
      {
        heading: "Inversion and compound intervals",
        body: [
          "Flip an interval by moving the lower note up an octave and the names swap in pairs: 2nd ↔ 7th, 3rd ↔ 6th, 4th ↔ 5th, with major ↔ minor. A major 3rd (C–E) inverts to a minor 6th (E–C). This is why a chord in inversion still sounds like the same chord: the intervals are the same set, rearranged.",
          "Intervals larger than an octave are compound: a 9th is a 2nd plus an octave, a 10th a 3rd plus an octave, up to the 13th. Chord extensions (9, 11, 13) are named this way because they sit above the seventh.",
        ],
        examples: [seq("Major 3rd C4–E4, then its inversion E4–C5 (minor 6th)", [60, 64, 64, 72], 500), seq("Major 9th: C4 up to D5", [60, 74], 700)],
        terms: [
          { term: "Compound interval", definition: "An interval wider than an octave: 9th, 10th, 11th, 12th, 13th." },
          { term: "Interval inversion", definition: "Moving the lower note up an octave; a 3rd becomes a 6th, major becomes minor, perfect stays perfect." },
        ],
      },
    ],
    drills: [
      { label: "Intervals: pair", href: "/trainer?mode=intervals", hint: "Melodic and harmonic, simple intervals, then compound." },
      { label: "Intervals: chain and stack", href: "/trainer?mode=intervals", hint: "Every consecutive interval of a line; every interval from the bass of a chord." },
    ],
  },
  {
    id: "scales-and-modes",
    title: "Scales, keys and modes",
    area: "foundations",
    summary: "The note collections most music is built from, what makes each one sound the way it does, and the names of the degrees.",
    sections: [
      {
        heading: "Major and the minor family",
        body: [
          "A scale is a set of pitch classes with a home note, the tonic. Major is the pattern of steps W W H W W W H (whole, whole, half …) from the tonic: C major is C D E F G A B. Its bright quality comes from the major third above the tonic and the leading tone a half step below it.",
          "Natural minor lowers the 3rd, 6th and 7th: A minor is A B C D E F G, the same notes as C major (its relative major) with a different home. Harmonic minor raises the 7th back up (G♯) so the dominant chord has a leading tone; melodic minor raises the 6th too on the way up (F♯ G♯) for a smoother line.",
        ],
        examples: [seq("C major", [60, 62, 64, 65, 67, 69, 71, 72], 320), seq("A natural minor", [57, 59, 60, 62, 64, 65, 67, 69], 320), seq("A harmonic minor (raised 7th)", [57, 59, 60, 62, 64, 65, 68, 69], 320), seq("A melodic minor, ascending", [57, 59, 60, 62, 64, 66, 68, 69], 320)],
        terms: [
          { term: "Scale", definition: "An ordered set of pitch classes starting from a tonic." },
          { term: "Tonic", definition: "The home note of a key or scale; the first degree." },
          { term: "Key", definition: "A tonic plus a scale, e.g. E♭ major or F♯ minor; the frame a piece is heard in." },
          { term: "Relative minor / major", definition: "Two keys sharing the same notes with different tonics: C major and A minor." },
          { term: "Leading tone", definition: "The 7th degree a half step below the tonic; it pulls up to the tonic." },
        ],
      },
      {
        heading: "Scale degrees have names and jobs",
        body: [
          "Degrees are numbered 1–7 from the tonic: tonic, supertonic, mediant, subdominant, dominant, submediant, leading tone (or subtonic when it is a whole step below). The dominant (5) and the leading tone (7) create the pull back to 1; the subdominant (4) leans away from home. Chords take these names too: 'the dominant chord' is the chord on degree 5.",
          "Hearing a melody as degrees rather than absolute notes is what lets you transpose instantly and recognise the same tune in any key. With absolute pitch this is a deliberate extra step: you already know it is a G; ask yourself which degree the G is in this key.",
        ],
        terms: [
          { term: "Scale degree", definition: "A note's position in the scale, 1–7 from the tonic." },
          { term: "Dominant", definition: "The 5th degree, and the chord built on it; the strongest pull back to the tonic." },
          { term: "Subdominant", definition: "The 4th degree and its chord; motion away from home." },
        ],
      },
      {
        heading: "The seven modes",
        body: [
          "Start the major scale on each of its degrees and you get the modes: Ionian (major), Dorian, Phrygian, Lydian, Mixolydian, Aeolian (natural minor), Locrian. Each has one or two notes that give it away: Dorian is minor with a raised 6th (D E F G A B C), Mixolydian is major with a lowered 7th (G A B C D E F), Lydian is major with a raised 4th (F G A B C D E), Phrygian is minor with a lowered 2nd.",
          "In the app's generators, dorian and mixolydian appear alongside major and minor because they cover most pop, folk and jazz melodies that are 'not quite major or minor'.",
        ],
        examples: [seq("D dorian", [62, 64, 65, 67, 69, 71, 72, 74], 320), seq("G mixolydian", [67, 69, 71, 72, 74, 76, 77, 79], 320), seq("F lydian", [65, 67, 69, 71, 72, 74, 76, 77], 320), seq("E phrygian", [64, 65, 67, 69, 71, 72, 74, 76], 320)],
        terms: [
          { term: "Mode", definition: "A scale made by starting the major collection on a different degree; each has its own colour." },
          { term: "Dorian", definition: "Minor mode with a raised 6th; the second mode of major." },
          { term: "Mixolydian", definition: "Major mode with a lowered 7th; the fifth mode of major." },
          { term: "Lydian", definition: "Major mode with a raised 4th; the fourth mode of major." },
        ],
      },
      {
        heading: "Pentatonic, blues, chromatic, whole tone",
        body: [
          "Major pentatonic drops the two half-step neighbours (4 and 7) to leave five notes that never clash: C D E G A. Minor pentatonic is its relative: A C D E G. The blues scale adds the flat 5 to minor pentatonic: A C D E♭ E G.",
          "The chromatic scale is all twelve notes; the whole-tone scale is six notes two semitones apart (C D E F♯ G♯ A♯) with no tonic pull, which is why it floats. Diminished (octatonic) alternates whole and half steps and underlies diminished seventh chords.",
        ],
        examples: [seq("C major pentatonic", [60, 62, 64, 67, 69, 72], 320), seq("A blues", [57, 60, 62, 63, 64, 67, 69], 320), seq("C whole tone", [60, 62, 64, 66, 68, 70, 72], 320)],
        terms: [
          { term: "Pentatonic", definition: "A five-note scale; major pentatonic is degrees 1 2 3 5 6." },
          { term: "Chromatic", definition: "All twelve pitch classes in semitone steps." },
          { term: "Whole-tone scale", definition: "Six notes two semitones apart; symmetrical, no leading tone." },
        ],
      },
    ],
    drills: [
      { label: "Theory drills: scales and modes", href: "/compose?tab=theory", hint: "Levels 1–3 ask for scales up, down and both ways." },
      { label: "Hear It, Play It in a mode", href: "/transcribe", hint: "Generated phrases in dorian or mixolydian." },
    ],
  },
  {
    id: "chords",
    title: "Chords: triads, sevenths and extensions",
    area: "harmony",
    summary: "The full vocabulary the app quizzes: 33 qualities, how they are built, and what each one sounds like.",
    skill: "chords",
    sections: [
      {
        heading: "Triads",
        body: [
          "A triad is a root plus a third and a fifth above it. Four qualities: major (4 + 3 semitones: C E G), minor (3 + 4: C E♭ G), diminished (3 + 3: C E♭ G♭) and augmented (4 + 4: C E G♯). Major and minor are stable; diminished and augmented are tense because their fifth is not perfect.",
          "Two more three-note chords swap the third for a neighbour: sus2 (C D G) and sus4 (C F G). They have no major-or-minor identity, which is why they feel open.",
        ],
        examples: [chords("C major, C minor, C diminished, C augmented", [[60, 64, 67], [60, 63, 67], [60, 63, 66], [60, 64, 68]]), chords("Csus2, Csus4", [[60, 62, 67], [60, 65, 67]])],
        terms: [
          { term: "Triad", definition: "A three-note chord of root, third and fifth." },
          { term: "Root", definition: "The note a chord is named after and built from." },
          { term: "Chord quality", definition: "The pattern of intervals above the root: major, minor, diminished, dominant 7th, and so on." },
          { term: "Suspended chord", definition: "A triad with the third replaced by a 2nd or 4th (sus2, sus4)." },
        ],
      },
      {
        heading: "Sevenths",
        body: [
          "Add a seventh above the root and you get the workhorses of tonal harmony. Dominant 7th (major triad + minor 7th: C E G B♭) wants to resolve. Major 7th (C E G B) is soft and settled. Minor 7th (C E♭ G B♭) is the neutral minor colour. Half-diminished, written m7♭5 (C E♭ G♭ B♭), is the ii chord of minor keys. Diminished 7th (C E♭ G♭ B♭♭, i.e. A) is a stack of minor thirds and is symmetrical: any of its notes can be the root. Minor-major 7th (C E♭ G B) is the film-noir chord. The 6th chords (C E G A, C E♭ G A) are seventh-chord cousins with the 6th instead of the 7th.",
        ],
        examples: [chords("C7, Cmaj7, Cm7, Cm7♭5, Cdim7, CmMaj7", [[60, 64, 67, 70], [60, 64, 67, 71], [60, 63, 67, 70], [60, 63, 66, 70], [60, 63, 66, 69], [60, 63, 67, 71]])],
        terms: [
          { term: "Dominant seventh", definition: "Major triad plus minor 7th (C7 = C E G B♭); the chord that most wants to resolve." },
          { term: "Half-diminished", definition: "m7♭5: diminished triad plus minor 7th." },
          { term: "Diminished seventh", definition: "Four notes each a minor third apart; symmetrical, every note can be the root." },
        ],
      },
      {
        heading: "Extensions and alterations",
        body: [
          "Keep stacking thirds and you pass the octave: the 9th (a 2nd up an octave), 11th (a 4th) and 13th (a 6th). C9 is C E G B♭ D; Cmaj9 has B instead of B♭; Cm9 is minor. A 13th chord in principle has seven notes, so in practice players omit the 5th and often the 11th. 'add9' means the 9th without the 7th (C E G D), a pop staple; 6/9 is C E G A D.",
          "Altered dominants raise or lower the 5th or 9th to add pull: 7♭9, 7♯9 (the Hendrix chord), 7♯11, 7♭13, aug7. They live almost only on dominant chords heading somewhere.",
        ],
        examples: [chords("C9, Cmaj9, Cm9", [[60, 64, 67, 70, 74], [60, 64, 67, 71, 74], [60, 63, 67, 70, 74]]), chords("Cadd9, C6/9, C13", [[60, 64, 67, 74], [60, 64, 67, 69, 74], [60, 64, 67, 70, 74, 81]]), chords("C7♭9, C7♯9, C7♯11", [[60, 64, 67, 70, 73], [60, 64, 67, 70, 75], [60, 64, 67, 70, 78]])],
        terms: [
          { term: "Extension", definition: "A chord tone above the 7th: 9th, 11th, 13th." },
          { term: "Altered chord", definition: "A dominant with a raised or lowered 5th or 9th (7♭9, 7♯9, 7♯11, 7♭13)." },
          { term: "Add chord", definition: "A triad with an extension but no 7th, e.g. add9." },
        ],
      },
      {
        heading: "Inversions: who is in the bass",
        body: [
          "A chord is in root position when its root is the lowest note, in first inversion when the third is lowest, second inversion when the fifth is, third inversion (sevenths only) when the seventh is. Written with a slash: C/E is C major, first inversion. The notes are the same; the bass changes the weight and the smoothness of the line underneath.",
          "The trainer can ask 'which inversion' as a separate answer, and the theory drills can demand a specific inversion, because hearing the bass note as a chord tone rather than 'a note' is what makes fast reduction possible.",
        ],
        examples: [chords("C major: root position, first inversion, second inversion", [[60, 64, 67], [64, 67, 72], [67, 72, 76]])],
        terms: [{ term: "Inversion (chord)", definition: "Which chord tone is lowest: root position, 1st (third), 2nd (fifth), 3rd (seventh)." }],
      },
    ],
    drills: [
      { label: "Chords & clusters: root + quality", href: "/trainer?mode=chords", hint: "Triads and sevenths first; add extensions and ask the inversion later." },
      { label: "Theory drills: chords by name", href: "/compose?tab=theory", hint: "Levels 1–4 climb from triads to altered chords." },
    ],
  },
  {
    id: "voicings",
    title: "Voicings: the same chord, arranged",
    area: "harmony",
    summary: "Closed, open, drop-2, doubling and range: why two versions of the same chord sound so different.",
    skill: "theory",
    sections: [
      {
        heading: "Closed and open",
        body: [
          "A voicing is the specific set of pitches (with octaves) used for a chord. Closed voicing packs the chord tones inside one octave; open (spread) voicing moves every other note up an octave so the chord breathes. Closed voicings sit well in the middle register; low closed voicings turn to mud because the overtones of the bass notes collide.",
        ],
        examples: [chords("C major 7 closed, then open", [[60, 64, 67, 71], [60, 67, 76, 83]])],
        terms: [
          { term: "Voicing", definition: "The particular pitches and octaves chosen for a chord's notes." },
          { term: "Closed voicing", definition: "All chord tones within one octave." },
          { term: "Open voicing", definition: "Chord tones spread over more than an octave." },
        ],
      },
      {
        heading: "Drop-2 and drop-3",
        body: [
          "Take a closed four-note voicing and drop the second note from the top down an octave: that is drop-2, the standard way guitarists and arrangers open a seventh chord. Drop-3 drops the third from the top instead. Each inversion of the closed voicing gives a different drop-2, so one chord has four drop-2 shapes.",
          "The theory drills ask for drop-2 by name at level 4 and in progressions; the grader checks the shape (relative spacing) rather than absolute octave.",
        ],
        examples: [chords("Cmaj7: closed, then drop-2 (E dropped an octave)", [[60, 64, 67, 71], [52, 60, 67, 71]])],
        terms: [{ term: "Drop-2 voicing", definition: "A four-note closed voicing with its second-highest note moved down an octave." }],
      },
      {
        heading: "Doubling, omission and range",
        body: [
          "With more hands or voices than chord tones, you double something: the root first, then the fifth; avoid doubling the leading tone or the seventh, which resolve and would create parallels. With fewer notes than tones, omit the fifth first (it adds least), keep the third and seventh (they define quality).",
          "Rules of thumb for range: keep thirds out of the low register (below about C3 a major third sounds muddy), let the bass have space, and let the melody note sit on top. A producer hearing 'muddy' is almost always hearing closed thirds or sevenths too low.",
        ],
        terms: [
          { term: "Doubling", definition: "Giving the same chord tone to two voices, usually an octave apart." },
          { term: "Guide tones", definition: "The third and seventh of a chord: the two notes that define its quality." },
        ],
      },
    ],
    drills: [
      { label: "Theory drills: voicings", href: "/compose?tab=theory", hint: "Level 3 open voicings, level 4 drop-2; strict grading checks the shape." },
      { label: "Find the Mistake: wrong inversion / voicing", href: "/mistakes", hint: "Always plays the clean version first." },
    ],
  },
  {
    id: "harmony-and-progressions",
    title: "Harmony: roman numerals and progressions",
    area: "harmony",
    summary: "How chords are named inside a key, why some progressions feel inevitable, and the ones you will meet everywhere.",
    skill: "mistakes",
    sections: [
      {
        heading: "Roman numerals",
        body: [
          "Inside a key each scale degree carries a chord, written as a roman numeral: upper case for major, lower for minor, ° for diminished. In major: I ii iii IV V vi vii°. In natural minor: i ii° III iv v VI VII, and V is usually made major (harmonic minor) so it can pull to i.",
          "Sevenths follow: Imaj7, ii7, iii7, IVmaj7, V7, vi7, viiø7 in major. The numeral names the function, not the absolute chord, so 'ii–V–I in F♯' means G♯m7, C♯7, F♯maj7.",
        ],
        examples: [chords("C major: I ii iii IV V vi vii°", [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72], [67, 71, 74], [69, 72, 76], [71, 74, 77]], 700)],
        terms: [
          { term: "Roman numeral", definition: "A chord named by the scale degree of its root: I, ii, V7 …" },
          { term: "Diatonic", definition: "Using only the notes of the key; a diatonic chord is built from scale tones." },
          { term: "Function", definition: "A chord's role: tonic (rest), subdominant (away), dominant (pull home)." },
        ],
      },
      {
        heading: "Cadences and the pull of V",
        body: [
          "A cadence is a point of arrival. V–I (authentic) is the strongest close because the leading tone rises to the tonic and the seventh of V7 falls to the third of I. IV–I (plagal, the 'amen') is softer. V–vi (deceptive) sets up an arrival and swerves. Ending on V (half cadence) leaves the door open.",
          "ii–V–I is the jazz spine: subdominant to dominant to tonic in the smoothest possible bass motion (up a fourth twice). Almost any jazz standard is a chain of ii–V–Is in different keys.",
        ],
        examples: [chords("C: V7 to I", [[55, 59, 62, 65], [60, 64, 67, 72]], 1000), chords("C: ii7 V7 Imaj7", [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71]], 1000), chords("C: V to vi (deceptive)", [[67, 71, 74], [69, 72, 76]], 1000)],
        terms: [
          { term: "Cadence", definition: "A chord pattern that closes a phrase: authentic (V–I), plagal (IV–I), deceptive (V–vi), half (ending on V)." },
          { term: "ii–V–I", definition: "The core jazz progression: supertonic, dominant, tonic." },
        ],
      },
      {
        heading: "Progressions you will hear everywhere",
        body: [
          "I–V–vi–IV (and its rotation vi–IV–I–V) carries a large share of pop since the nineties. I–vi–IV–V is the doo-wop and fifties progression. I–IV–V is the blues and rock base; the 12-bar blues is I I I I / IV IV I I / V IV I I with dominant sevenths on every chord. ii–V–I and I–vi–ii–V (rhythm changes) are the jazz base.",
          "The prompt drill and the mistake drill draw from these shapes so that what you practise is what you will meet in a session.",
        ],
        examples: [chords("C: I V vi IV", [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]], 900), chords("C: I vi IV V", [[60, 64, 67], [69, 72, 76], [65, 69, 72], [67, 71, 74]], 900)],
      },
      {
        heading: "Beyond the key: secondary dominants, borrowing, modulation",
        body: [
          "A secondary dominant is the V7 of a chord other than I: in C, D7 (V7 of G) before G, or A7 (V7 of D minor) before Dm. It adds a chromatic note (F♯ or C♯) that points at the next chord. Borrowed chords come from the parallel key: in C major, F minor (iv) or A♭ major (♭VI) from C minor add sudden shade. Modulation is a real change of key, usually through a pivot chord that belongs to both.",
          "When Find the Mistake swaps a chord's quality, it usually introduces exactly this kind of chromatic note, which is what you are hearing as 'wrong'. The difference between a wrong chord and a deliberate borrowed chord is context and preparation.",
        ],
        examples: [chords("C: I, V7/V (D7), V7, I", [[60, 64, 67], [62, 66, 69, 72], [67, 71, 74, 77], [60, 64, 67]], 900), chords("C: I, iv (borrowed F minor), I", [[60, 64, 67], [65, 68, 72], [60, 64, 67]], 900)],
        terms: [
          { term: "Secondary dominant", definition: "The dominant seventh of a chord other than the tonic, written V7/x." },
          { term: "Borrowed chord", definition: "A chord taken from the parallel major or minor key (modal mixture)." },
          { term: "Modulation", definition: "Changing key within a piece." },
          { term: "Pivot chord", definition: "A chord that belongs to both the old and the new key, used to modulate smoothly." },
        ],
      },
    ],
    drills: [
      { label: "Theory drills: progressions", href: "/compose?tab=theory", hint: "Level 5 asks for ii–V–I and friends in any key." },
      { label: "Find the Mistake: chord quality", href: "/mistakes", hint: "Generated progression source, chord quality on." },
      { label: "Prompt drill", href: "/compose?tab=prompt", hint: "Improvise over the progression with the backing on." },
    ],
  },
  {
    id: "voice-leading",
    title: "Voice leading",
    area: "harmony",
    summary: "How each voice moves from chord to chord, the rules that make four parts sound like one thing, and what 'parallel fifths' means.",
    skill: "mistakes",
    sections: [
      {
        heading: "Voices, not chords",
        body: [
          "Voice leading treats a chord progression as several melodic lines happening at once: soprano, alto, tenor, bass in a chorale, or the top, inner and bottom notes of your piano voicings. Good voice leading moves each voice the shortest distance, keeps common tones where they are, and lets the outer voices (soprano and bass) shape the phrase.",
          "The Bach chorales bundled in the app are the textbook: four voices, mostly stepwise, every chord change reachable with small moves.",
        ],
        terms: [
          { term: "Voice leading", definition: "How the individual voices move from one chord to the next." },
          { term: "SATB", definition: "Soprano, alto, tenor, bass: the four voices of a chorale." },
          { term: "Common tone", definition: "A note shared by two consecutive chords, ideally kept in the same voice." },
        ],
      },
      {
        heading: "Parallel fifths and octaves",
        body: [
          "When two voices are a perfect fifth (or octave) apart and both move the same distance to another perfect fifth (or octave), they are parallel. In four-part writing this is avoided because the two voices stop sounding independent: the fifth is so consonant that they fuse into one thicker voice, and the texture loses a part. Contrary motion (voices moving in opposite directions) and oblique motion (one voice holds) keep independence.",
          "In rock, power chords are nothing but parallel fifths, on purpose. The rule is about style: it is a fault in a chorale and a sound in a guitar riff. Find the Mistake plants parallels in chorales precisely because there they stick out.",
        ],
        examples: [chords("Parallel fifths: C–G moving to D–A", [[60, 67], [62, 69]], 900), chords("The same chords with contrary motion: C–G to D–F♯ … then G–D", [[60, 67], [62, 66], [67, 74]], 900)],
        terms: [
          { term: "Parallel fifths / octaves", definition: "Two voices a perfect fifth or octave apart moving in the same direction to another fifth or octave." },
          { term: "Contrary motion", definition: "Two voices moving in opposite directions." },
          { term: "Oblique motion", definition: "One voice moves while another holds." },
        ],
      },
      {
        heading: "Tendencies: leading tone and seventh",
        body: [
          "Two notes carry obligations. The leading tone (degree 7) in a dominant chord rises to the tonic. The seventh of a seventh chord falls by step. Doubling the leading tone means two voices want to go to the same place, which forces parallel octaves or a broken resolution; that is the 'doubled leading tone' fault. Resolve the seventh down, the leading tone up, and V7–I falls into place by itself.",
        ],
        examples: [chords("G7 to C with the tendencies resolved (B up, F down)", [[55, 59, 62, 65], [60, 60, 64, 67]], 1100)],
        terms: [{ term: "Tendency tone", definition: "A note with an expected resolution: the leading tone up, the chord seventh down." }],
      },
      {
        heading: "Ranges and spacing in four parts",
        body: [
          "Chorale ranges: soprano about C4–G5, alto G3–D5, tenor C3–G4, bass E2–C4. Keep adjacent upper voices within an octave of each other; the bass may sit further away. Voices should not cross (alto above soprano) or overlap across a chord change. These constraints are why a chorale phrase in the app has notes where it has them, and why the voice picker lists the four names.",
        ],
      },
    ],
    drills: [
      { label: "Find the Mistake: voice-leading fault", href: "/mistakes", hint: "Bach chorale source, voice leading on; you get beat + voice." },
      { label: "Hear It, Play It: two voices", href: "/transcribe", hint: "Chorale with soprano and bass ticked." },
    ],
  },
  {
    id: "tuning-and-cents",
    title: "Tuning, cents and temperament",
    area: "hearing",
    summary: "What 'ten cents sharp' means, how small a difference people can hear, and why a perfectly tuned piano is slightly out of tune on purpose.",
    skill: "cents",
    sections: [
      {
        heading: "Cents",
        body: [
          "A cent is a hundredth of a semitone, so there are 1200 in an octave. It is a ratio, not a fixed number of hertz: 10 cents on A4 is about 2.5 Hz, on A2 about 0.6 Hz. Tuners, DAWs and the app's Cents mode all talk in cents. A quarter tone is 50 cents; 100 cents is the next key.",
          "Detuning by a few cents does not change which note you hear; it changes how it sits against a reference. On its own a note 15 cents sharp still 'is' the note. Against another sounding pitch it beats: you hear a slow wobble whose speed equals the frequency difference.",
        ],
        examples: [
          { label: "A4 in tune, then 20 cents sharp, then 20 cents flat", steps: [{ midis: [69], ms: 900 }, { midis: [69], detune: 20, ms: 900 }, { midis: [69], detune: -20, ms: 900 }] },
          { label: "A4 in tune with a second A4 15 cents sharp: hear the beating", steps: [{ midis: [69], ms: 300 }, { midis: [69, 69], detune: 0, ms: 100 }, { midis: [69], detune: 15, ms: 2200 }] },
        ],
        terms: [
          { term: "Cent", definition: "1/100 of a semitone; 1200 cents per octave. A logarithmic unit, so it means the same at any pitch." },
          { term: "Beating", definition: "The slow pulsing heard when two nearly equal pitches sound together; its rate is their frequency difference." },
          { term: "JND", definition: "Just-noticeable difference: the smallest change you can reliably detect. For pitch, a few cents in good conditions." },
        ],
      },
      {
        heading: "Equal temperament and what it costs",
        body: [
          "Modern instruments use twelve-tone equal temperament: every semitone is the same ratio (the twelfth root of two, about 1.0595). That makes every key sound the same and lets you modulate anywhere. The price is that the pure intervals of the harmonic series are slightly off: the equal-tempered major third is about 14 cents sharp of a pure 5:4 third, the fifth about 2 cents flat of a pure 3:2. A perfectly tuned piano therefore has slightly beating thirds, and that is correct.",
          "Just intonation tunes the pure ratios and sounds smoother in one key but wrong in others; choirs, string quartets and brass drift towards it by ear. Meantone and well temperaments were historical compromises. When a producer says a synth chord sounds 'too sweet' or 'wrong' against a piano, this is often what is going on.",
        ],
        terms: [
          { term: "Equal temperament", definition: "Tuning with twelve identical semitone ratios; all keys equivalent." },
          { term: "Just intonation", definition: "Tuning intervals to simple frequency ratios (3:2, 5:4); pure in one key, unusable across keys." },
          { term: "Harmonic series", definition: "The overtones of a pitch at 2×, 3×, 4× … its frequency; the source of pure intervals." },
        ],
      },
      {
        heading: "Why things go out of tune",
        body: [
          "Strings stretch and settle, wood and metal move with temperature, singers drift with breath and register, a synth might be programmed with a cent offset for width. Producers hear drift as a haze around a part rather than a wrong note. The Cents mode trains the single-note case; Find the Mistake's 'drifted voice' trains hearing it inside a texture, which is the production-relevant version.",
        ],
      },
    ],
    drills: [
      { label: "Cents: single, pair, triad", href: "/trainer?mode=cents", hint: "Start at 20–50 cents; the Stats tab tracks your JND per day." },
      { label: "Find the Mistake: detuned note and drift", href: "/mistakes", hint: "The same skill inside melodies and chorales." },
    ],
  },
  {
    id: "rhythm-and-meter",
    title: "Rhythm and meter",
    area: "foundations",
    summary: "Beats, bars, subdivisions and why an early note is audible even when the pitch is perfect.",
    sections: [
      {
        heading: "Beat, bar, tempo",
        body: [
          "The beat is the steady pulse; tempo is its speed in beats per minute. Bars group beats: 4/4 has four quarter-note beats per bar, 3/4 three, 6/8 two beats each of three eighths. The first beat of a bar (the downbeat) carries the most weight, the third beat in 4/4 the next.",
          "Subdivisions split beats: eighths (two per beat), sixteenths (four), triplets (three). The app's grids for quantizing use exactly these.",
        ],
        terms: [
          { term: "Beat", definition: "The steady pulse a piece is counted in." },
          { term: "Tempo", definition: "Beat speed in beats per minute (bpm)." },
          { term: "Bar (measure)", definition: "A group of beats; the time signature says how many and of what length." },
          { term: "Downbeat", definition: "The first beat of a bar, the strongest." },
          { term: "Subdivision", definition: "Splitting a beat into equal parts: eighths, sixteenths, triplets." },
        ],
      },
      {
        heading: "Syncopation, swing, quantization",
        body: [
          "Syncopation puts weight where the meter does not expect it: on an offbeat or a weak beat. Swing delays every second eighth so pairs become long–short. Quantization snaps recorded onsets to a grid; the amount of a slip is exactly what Find the Mistake plants as a 'rhythm slip' (a quarter beat early or late by default). A quarter beat at 90 bpm is about 170 ms, which is very audible once the pulse is established, and invisible without one, which is why the click track exists.",
        ],
        terms: [
          { term: "Syncopation", definition: "Accents on weak beats or between beats." },
          { term: "Swing", definition: "Uneven eighths: long–short pairs." },
          { term: "Quantize", definition: "Snap note timings to a grid." },
        ],
      },
    ],
    drills: [
      { label: "Find the Mistake: rhythm slip", href: "/mistakes", hint: "Turn the click track on the first few times." },
      { label: "Hear It, Play It with rhythm graded", href: "/transcribe", hint: "The rhythm toggle adds timing to the score." },
    ],
  },
  {
    id: "timbre-and-harmonics",
    title: "Timbre and harmonics",
    area: "hearing",
    summary: "Why a flute, a bell and a synth playing the same note sound different, and why some sounds hide their pitch.",
    skill: "timbre",
    sections: [
      {
        heading: "The harmonic series",
        body: [
          "A vibrating string or air column sounds not one frequency but a series: the fundamental f, then 2f (octave), 3f (fifth above that), 4f (two octaves), 5f (major third above), 6f, 7f (a flat minor seventh) and on. Timbre is mostly the recipe: how loud each harmonic is and how that changes over time. A clarinet has weak even harmonics, which is why it sounds hollow; a sawtooth synth has them all, which is why it is bright.",
          "Your sense of pitch is the brain finding the fundamental behind that series, which it can do even when the fundamental itself is missing (a small speaker still plays a bass note you can name).",
        ],
        examples: [seq("The first six harmonics of C2 as separate notes", [36, 48, 55, 60, 64, 67], 450), chord("The first six harmonics together (they fuse into one bright C2)", [36, 48, 55, 60, 64, 67], 2000)],
        terms: [
          { term: "Timbre", definition: "The colour of a sound: what makes two instruments at the same pitch and loudness sound different." },
          { term: "Fundamental", definition: "The lowest harmonic, whose frequency is the pitch you name." },
          { term: "Overtone / harmonic", definition: "Higher frequencies sounding along with the fundamental, at whole-number multiples for pitched instruments." },
        ],
      },
      {
        heading: "Inharmonic sounds and octave errors",
        body: [
          "Bells, gongs, marimba bars and piano strings do not have exact whole-number harmonics: the partials are stretched or shifted. The brain then has to guess the fundamental, and different listeners guess differently, sometimes an octave apart. This is why the app's 'hard' and 'chaos' tiers exist and why octave accuracy drops on them. Piano tuners even stretch the tuning of the extreme registers to match the stretched partials.",
          "Attack matters too: a sound with a long soft attack (strings, pads) gives the ear time; a percussive sound with a short decay (pizzicato, marimba) leaves only a few cycles to judge, so short notes on such sounds are harder even for absolute pitch.",
        ],
        terms: [
          { term: "Partial", definition: "Any component frequency of a sound; harmonics are the whole-number partials." },
          { term: "Inharmonicity", definition: "Partials that are not whole-number multiples of the fundamental (bells, piano strings)." },
          { term: "Envelope", definition: "How a sound's loudness changes over time: attack, decay, sustain, release." },
        ],
      },
    ],
    drills: [
      { label: "Single note with the hard and chaos tiers", href: "/trainer?mode=single", hint: "Instrument pool: Everything, new sound every question." },
      { label: "Find the Mistake with a different instrument per voice", href: "/mistakes", hint: "Instruments: different per voice." },
    ],
  },
  {
    id: "ear-training-for-absolute-pitch",
    title: "Ear training when you already have perfect pitch",
    area: "practice",
    summary: "What the gift gives for free, what it does not, and how each tab in this app targets a limit.",
    skill: "memory",
    sections: [
      {
        heading: "What is free and what is not",
        body: [
          "Absolute pitch answers 'which note' without a reference. It does not by itself give you: memory span (holding twelve notes before playing them), separation (pulling one line out of four), timbre independence (a bell or a synth pad), tuning resolution (five cents), harmonic vocabulary (naming a 13♭9 rather than listing six notes), or hand speed (getting there on the keys before the moment passes). Each of those is trainable and each is measured here.",
        ],
      },
      {
        heading: "Chunking: the memory trick",
        body: [
          "Nobody remembers twelve independent notes; people remember three chunks of four. Chunks are built from the vocabulary in the Harmony lessons: a run of scale degrees, an arpeggio, a ii–V. The Sequence mode grows raw span; Hear It, Play It's ladder grows span in musical material where chunking is possible. When a phrase gets away from you, it is almost always because you heard notes instead of shapes.",
        ],
        terms: [{ term: "Chunking", definition: "Grouping notes into meaningful units (scale runs, arpeggios, progressions) so more fits in memory." }],
      },
      {
        heading: "Separation: one voice out of many",
        body: [
          "Polyphony is parsed by following a voice through time, not by reading a chord vertically. Practise it in this order: name the top note of each chord, then the bass, then the inner voices; then play back one voice of a chorale, then two, then all. Clusters in the trainer remove the theory crutch so the raw skill gets exercised.",
        ],
      },
      {
        heading: "How to practise",
        body: [
          "Short and daily beats long and rare: twenty minutes with a mix of two or three modes, six days a week. Keep the trainer on hard defaults; the point of a wrong answer is the correction screen, which is why wrong answers hold until you move on. Read the Progress tab weekly and let the weakest skill pick the next week's plan. The starter programme on the Calendar tab is a ramp built on this.",
          "Tell-tale signs to watch in Stats: a confusion matrix cell that keeps lighting up (a pair of notes you swap), an octave with lower accuracy, an interval below 90 %, a cents JND that has stopped falling. Each one has a lesson and a drill.",
        ],
      },
    ],
    drills: [
      { label: "Sequence (memory span)", href: "/trainer?mode=sequence", hint: "Grow the length one note at a time." },
      { label: "Hear It, Play It: ladder", href: "/transcribe", hint: "Length grows with success, shrinks with failure." },
      { label: "Clusters", href: "/trainer?mode=chords", hint: "Random clusters, any order." },
    ],
  },
  {
    id: "reading-and-writing-what-you-hear",
    title: "From hearing to notes: transcription and the piano roll",
    area: "practice",
    summary: "How the app grades a performance, how to transcribe methodically, and the words producers use for what you hear.",
    skill: "transcription",
    sections: [
      {
        heading: "The piano roll",
        body: [
          "The piano roll is the DAW view: time runs left to right, pitch runs bottom to top, every note is a bar whose length is its duration. Colours in this app: blue is what was played, grey a reference, green matched, red wrong, amber missing, purple extra. Reading it fast is a skill in itself and is worth ten minutes.",
        ],
        terms: [
          { term: "Piano roll", definition: "A time-versus-pitch grid where each note is a horizontal bar; the standard DAW editor." },
          { term: "MIDI", definition: "The message protocol instruments use: which key, how hard, when. Your piano sends it over USB." },
        ],
      },
      {
        heading: "How grading works here",
        body: [
          "Pitch grading aligns what you played to the reference with an edit distance, so one dropped or extra note does not shift everything after it: each reference note ends up matched, wrong (something else played in its place) or missing, and unmatched played notes are extra. Notes played within 80 ms of each other count as a chord and are ordered by pitch, so chords are order-insensitive. Rhythm, when it is turned on, fits a tempo line through the matched notes (you set your own speed) and measures each note's deviation in beats.",
        ],
        terms: [{ term: "Edit distance", definition: "The minimum number of insertions, deletions and substitutions to turn one sequence into another; used to align a performance to a reference." }],
      },
      {
        heading: "A method for transcribing",
        body: [
          "Bass first: it fixes the harmony. Then the melody (the top line). Then count how many voices are between them and fill them in from the outside in. Write the rhythm as beats and subdivisions, not as durations in seconds. Check the harmony against the bass with roman numerals; if a chord does not fit, one of your notes is wrong. In chunk mode the app walks a piece phrase by phrase in exactly this spirit.",
        ],
      },
      {
        heading: "Saying what is wrong: the producer's words",
        body: [
          "Flat / sharp: below / above the intended pitch. Drifting: slowly going flat or sharp. Muddy: too many notes low, closed thirds under about C3. Clash: a note a semitone from a chord tone in another part, unintended. Wrong voicing: right chord, notes arranged so it loses the top line or doubles the wrong tone. Early / late / rushing / dragging: timing against the grid. Out of key: a note outside the current scale that is not doing a job. Naming the fix with these words is what Find the Mistake trains.",
        ],
      },
    ],
    drills: [
      { label: "Hear It, Play It: chunk mode", href: "/transcribe", hint: "A chorale, soprano only, then all voices." },
      { label: "Find the Mistake", href: "/mistakes", hint: "Ask for the fix (bonus) so you practise naming it." },
    ],
  },
];

export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

export interface GlossaryEntry extends Term {
  lessonId: string;
  lessonTitle: string;
}

/** Every term from every lesson, alphabetical, with the lesson it lives in. */
export function glossary(): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const l of LESSONS) for (const s of l.sections) for (const t of s.terms ?? []) out.push({ ...t, lessonId: l.id, lessonTitle: l.title });
  return out.sort((a, b) => a.term.localeCompare(b.term));
}

export { C4 };
