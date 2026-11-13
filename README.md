# Nara

Obrolan multi-model untuk Arya. Antarmukanya berbahasa Indonesia. Model datang dari [Coarena Model API](https://coarena.ai/docs), yang kompatibel dengan OpenAI.

Setiap balasan di-stream, ditandai model yang menulisnya, dan bisa dinilai jempol naik atau turun. Riwayat percakapan tersimpan di peramban. Lapisan penyimpanan sudah dipisah supaya nanti bisa diganti Postgres (Neon) tanpa mengubah layar obrolan.

## Menjalankan lokal

Perlu Node.js 20 atau lebih baru.

```bash
npm install
cp .env.example .env.local
```

Isi `COARENA_API_KEY` di `.env.local`. Kunci hanya dibaca di server. Jangan memakai prefiks `NEXT_PUBLIC_`, dan jangan meng-commit nilainya.

```bash
npm run dev
```

Buka [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Variabel lingkungan

| Nama | Di mana | Fungsi |
| --- | --- | --- |
| `COARENA_API_KEY` | Server saja | Bearer token untuk `POST /chat/completions` dan `POST /feedback`. `GET /models` tidak memakai kunci. |

## Deploy ke Vercel

1. Impor repositori ini. Framework yang terdeteksi: Next.js.
2. Di Project Settings → Environment Variables, tambahkan `COARENA_API_KEY` untuk Production dan Preview.
3. Deploy. Biarkan runtime fungsi di Node.js (bawaan). Jangan set Edge. Streaming jawaban berjalan di runtime Node.js.
4. Setelah deploy, buka situs, pastikan daftar model terisi, kirim satu pesan, lalu ganti model dan kirim pesan lagi.

Tidak ada database yang perlu disiapkan. Riwayat tetap di `localStorage` pengunjung.

## Penyimpanan

UI hanya mengenal `ConversationRepository` di `src/lib/persistence/repository.ts`. Implementasi sekarang, `BrowserConversationRepository`, menulis `localStorage`.

Untuk Neon nanti: buat tabel yang disket di komentar file itu, implementasikan antarmuka yang sama di route handler, lalu arahkan pabrik repositori ke sana. Komponen obrolan tidak perlu diubah.

## Catatan API Coarena

Dicatat dari dokumentasi dan panggilan langsung ke `https://coarena.ai/api/v1`.

- Daftar model hidup di `GET /models` (tanpa kunci). Setiap item punya `display_name`, `owned_by`, dan `capabilities` (`reasoning_text`, `vision`, `tools`, `efforts`). Saat diuji, daftar berisi 18 model. Beberapa id di halaman dokumentasi (misalnya model GPT) tidak ada di respons itu.
- Chat memakai `POST /chat/completions` dengan `stream: true`. Jawaban panjang yang tidak di-stream bisa tertahan sekitar 20 detik, jadi aplikasi selalu men-stream.
- Banyak model menalar. Delta stream mengulang jejak yang sama di `reasoning` dan `reasoning_content`. Aplikasi hanya menampilkan salah satunya, di bagian yang bisa dibuka.
- Token penalaran dihitung di dalam `completion_tokens` dan ikut memotong `max_tokens`. Aplikasi meminta `max_tokens: 8192` (batas API 16384; bawaan bila field dikosongkan adalah 8192).
- Stream SSE kadang menyisipkan komentar keepalive `: ok`. Parser mengabaikan baris yang bukan `data:`.
- Header penting: `x-coarena-request-id` (`req_…`), `x-coarena-model`. Bila Coarena mengganti model demi biaya atau pembatasan penyedia, header `x-coarena-substituted-from`, `x-coarena-substituted-to`, dan `x-coarena-substitution-reason` ikut terkirim. Lencana balasan menampilkan keduanya.
- Id di body adalah `chatcmpl-…` dengan sufiks yang sama seperti `req_…`. Keduanya diterima `POST /feedback`.
- Penilaian: `POST /feedback` dengan `{ "request_id", "rating": "up" | "down" | null, "note"?, "tags"? }`. Respons menormalkan rating menjadi `"good"` atau `"bad"`, `request_id` menjadi bentuk `req_…`, dan `updated_at` dalam milidetik. `rating: null` menghapus penilaian (`deleted: true`). Body yang sama dua kali tidak mengubah apa-apa. Tag yang dicoba (`helpful`, `concise`) diterima. Daftar tag di UI mengikuti dokumentasi.
- Kuota gratis yang tercatat: sekitar $5 pemakaian per hari, 30 permintaan per menit, 2 panggilan bersamaan. Melebihi batas mengembalikan 429 dengan pesan yang aplikasi teruskan ke layar.
