export interface FeedbackTag {
  id: string;
  label: string;
}

export const UP_TAGS: FeedbackTag[] = [
  { id: "correct", label: "Tepat" },
  { id: "helpful", label: "Membantu" },
  { id: "fast", label: "Cepat" },
  { id: "concise", label: "Ringkas" },
  { id: "thorough", label: "Menyeluruh" },
  { id: "creative", label: "Kreatif" },
  { id: "good_code", label: "Kode bagus" },
  { id: "followed_instructions", label: "Mengikuti instruksi" },
];

export const DOWN_TAGS: FeedbackTag[] = [
  { id: "wrong", label: "Salah" },
  { id: "unhelpful", label: "Kurang membantu" },
  { id: "refused", label: "Menolak" },
  { id: "too_slow", label: "Terlalu lambat" },
  { id: "bad_format", label: "Format buruk" },
  { id: "unsafe", label: "Tidak aman" },
  { id: "made_up", label: "Mengarang" },
  { id: "incomplete", label: "Tidak lengkap" },
  { id: "too_long", label: "Terlalu panjang" },
  { id: "off_topic", label: "Menyimpang" },
  { id: "bad_code", label: "Kode buruk" },
  { id: "ignored_instructions", label: "Mengabaikan instruksi" },
];

export const FEEDBACK_TAG_IDS = new Set(
  [...UP_TAGS, ...DOWN_TAGS].map((tag) => tag.id),
);

export const NOTE_LIMIT = 2000;
