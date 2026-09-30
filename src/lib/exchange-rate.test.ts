import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getMxnPerUsdRate, resetExchangeRateCache } from "./exchange-rate";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("getMxnPerUsdRate", () => {
  beforeEach(() => {
    resetExchangeRateCache();
    vi.stubEnv("BANXICO_TOKEN", "");
    vi.stubEnv("MXN_PER_USD", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses Frankfurter when there is no Banxico token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ date: "2026-09-29", rates: { MXN: 18.4321 } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getMxnPerUsdRate()).toEqual({ rate: 18.4321, source: "frankfurter", date: "2026-09-29" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("frankfurter");
  });

  it("prefers Banxico's FIX rate when BANXICO_TOKEN is set, sending the token as a header", async () => {
    vi.stubEnv("BANXICO_TOKEN", "tok123");
    const fetchMock = vi.fn().mockResolvedValue(
      json({ bmx: { series: [{ idSerie: "SF43718", datos: [{ fecha: "29/09/2026", dato: "18.3500" }] }] } })
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await getMxnPerUsdRate()).toEqual({ rate: 18.35, source: "banxico", date: "2026-09-29" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Bmx-Token"]).toBe("tok123");
  });

  it("falls back to Frankfurter when Banxico fails", async () => {
    vi.stubEnv("BANXICO_TOKEN", "tok123");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "bad token" }, 401))
      .mockResolvedValueOnce(json({ date: "2026-09-29", rates: { MXN: 18.4 } }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await getMxnPerUsdRate())?.source).toBe("frankfurter");
  });

  it("falls back to MXN_PER_USD when every source fails, and returns null without it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getMxnPerUsdRate()).toBeNull();

    vi.stubEnv("MXN_PER_USD", "18.5");
    expect(await getMxnPerUsdRate()).toEqual({ rate: 18.5, source: "env", date: null });
  });

  it("ignores an invalid rate from the source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ date: "2026-09-29", rates: { MXN: 0 } })));
    expect(await getMxnPerUsdRate()).toBeNull();
  });

  it("caches a good rate instead of calling the source on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ date: "2026-09-29", rates: { MXN: 18.4 } }));
    vi.stubGlobal("fetch", fetchMock);
    await getMxnPerUsdRate();
    await getMxnPerUsdRate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
