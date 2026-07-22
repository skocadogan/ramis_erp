import {
  captureWsRevision,
  isWsRevisionCurrent,
  markWsOrderMutation,
} from "../wsHttpRaceGuard";

describe("WS/HTTP race guard", () => {
  it("HTTP sürerken WS mutasyonu gelirse eski snapshot'ı reddeder", () => {
    const revisionAtRequestStart = captureWsRevision();

    markWsOrderMutation();

    expect(isWsRevisionCurrent(revisionAtRequestStart)).toBe(false);
  });

  it("arada WS mutasyonu yoksa snapshot'ı kabul eder", () => {
    const revisionAtRequestStart = captureWsRevision();

    expect(isWsRevisionCurrent(revisionAtRequestStart)).toBe(true);
  });
});
