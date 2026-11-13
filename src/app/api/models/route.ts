import { apiKey, COARENA_BASE_URL, normalizeModels, publicError } from "@/lib/coarena/server";

export async function GET() {
  try {
    const response = await fetch(`${COARENA_BASE_URL}/models`, { cache: "no-store" });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      return Response.json(
        { error: publicError(response.status, payload) },
        { status: 502 },
      );
    }
    const payload: unknown = await response.json();
    return Response.json({
      models: normalizeModels(payload),
      configured: Boolean(apiKey()),
    });
  } catch {
    return Response.json(
      { error: "Daftar model Coarena tidak tersedia." },
      { status: 502 },
    );
  }
}
