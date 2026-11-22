import type { ApiLine, ApiSummary } from "../team-order"
import {
  clientIp,
  currentProofOf,
  proofToApi,
  proofWithSnapshot,
  readSignRequest,
  readSignedName,
  readTrustedProxyHops,
  snapshotOf,
  whyNotReady,
  type StoredProof,
} from "../team-order-proof"

const HASH = "a".repeat(64)

const summary = (over: Partial<ApiSummary> = {}): ApiSummary => ({
  players: 20,
  pieces: 20,
  by_size: [],
  other_sizes: [],
  lines_without_size: 0,
  pieces_without_size: 0,
  ready_lines: 20,
  lines_to_fix: 0,
  indexes_to_fix: [],
  minimum: { required: 10, missing: 0, met: true },
  ready_for_proof: true,
  ...over,
})

describe("whyNotReady", () => {
  it("is null for a list with lines, no problem and the minimum met", () => {
    expect(whyNotReady(summary(), 0)).toBeNull()
  })
  it("says an empty list is empty, before anything else", () => {
    expect(whyNotReady(summary({ players: 0, pieces: 0, minimum: { required: 10, missing: 10, met: false } }), 0)).toEqual({
      code: "roster_empty",
      extra: {},
    })
  })
  it("reports problems with their count and the lines to fix", () => {
    expect(whyNotReady(summary({ lines_to_fix: 2, indexes_to_fix: [3, 5] }), 4)).toEqual({
      code: "roster_has_problems",
      extra: { problems: 4, indexes_to_fix: [3, 5] },
    })
  })
  it("counts a problem of the whole list too", () => {
    expect(whyNotReady(summary(), 1)?.code).toBe("roster_has_problems")
  })
  it("reports a list below the region's minimum, with how many pieces are missing", () => {
    expect(whyNotReady(summary({ players: 6, pieces: 6, minimum: { required: 10, missing: 4, met: false } }), 0)).toEqual({
      code: "roster_below_minimum",
      extra: { required: 10, missing: 4 },
    })
  })
  it("has no minimum to miss when the summary carries none", () => {
    expect(whyNotReady(summary({ minimum: null }), 0)).toBeNull()
  })
})

describe("snapshotOf", () => {
  it("takes what a proof freezes, in list order, without line ids", () => {
    const lines: ApiLine[] = [
      { id: "l1", name: "Ali", number: "7", size: "M", count: 1, no_name: false, no_number: false },
      { id: "l2", name: "", number: "", size: "L", count: 2, no_name: true, no_number: true },
    ]
    const s = snapshotOf(
      { design_version_id: "dv", product_id: "p", region_id: "r", team_name: "Lions", prints_name: true, prints_number: false, },
      lines
    )
    expect(s.prints).toEqual({ name: true, number: false })
    expect(s.lines).toEqual([
      { name: "Ali", number: "7", size: "M", count: 1, no_name: false, no_number: false },
      { name: "", number: "", size: "L", count: 2, no_name: true, no_number: true },
    ])
    expect(s.team_name).toBe("Lions")
  })
})

describe("readSignedName", () => {
  it("cleans the name as typed", () => {
    expect(readSignedName("  Ali   Khan ")).toBe("Ali Khan")
    expect(readSignedName("علی خان")).toBe("علی خان")
  })
  it("accepts exactly 100 characters (letters or emoji counted once each) and refuses 101", () => {
    expect(readSignedName("a".repeat(100))).toBe("a".repeat(100))
    expect(readSignedName("😀".repeat(100))).toBe("😀".repeat(100))
    expect(readSignedName("a".repeat(101))).toBeNull()
    expect(readSignedName("😀".repeat(101))).toBeNull()
    expect(readSignedName(" " + "a".repeat(100) + " ")).toBe("a".repeat(100))
  })
  it.each(["", "   ", "​", "a".repeat(101), 5, null, undefined, "a\nb", "a\u0000b"])("refuses %j", (v) => {
    expect(readSignedName(v)).toBeNull()
  })
})

describe("readSignRequest", () => {
  const ok = { proof_hash: HASH, signed_name: "Ali Khan", confirmed: true, schedule_state: "ok" }
  it("reads a complete request", () => {
    expect(readSignRequest(ok)).toEqual({ ok: true, value: { proofHash: HASH, signedName: "Ali Khan", scheduleState: "ok" } })
  })
  it("accepts the hash in capitals and with spaces around it", () => {
    const r = readSignRequest({ ...ok, proof_hash: ` ${HASH.toUpperCase()} ` })
    expect(r.ok && r.value.proofHash).toBe(HASH)
  })
  it.each([
    [{ proof_hash: undefined }, "proof_hash_required"],
    [{ proof_hash: "abc" }, "proof_hash_required"],
    [{ proof_hash: 5 }, "proof_hash_required"],
    [{ signed_name: "" }, "signed_name_required"],
    [{ signed_name: "  " }, "signed_name_required"],
    [{ signed_name: undefined }, "signed_name_required"],
    [{ confirmed: false }, "confirmation_required"],
    [{ confirmed: "true" }, "confirmation_required"],
    [{ confirmed: undefined }, "confirmation_required"],
    [{ schedule_state: undefined }, "schedule_state_required"],
    [{ schedule_state: "late" }, "schedule_state_required"],
  ])("refuses %j with %s", (change, code) => {
    expect(readSignRequest({ ...ok, ...change })).toEqual({ ok: false, code })
  })
})

describe("clientIp", () => {
  it("is the socket's address with no trusted proxy, whatever the header says", () => {
    expect(clientIp({ forwardedFor: "6.6.6.6", socketAddress: "10.0.0.5", trustedHops: 0 })).toBe("10.0.0.5")
  })
  it("takes the last entry behind one proxy, never the first (the client writes the first)", () => {
    expect(clientIp({ forwardedFor: "6.6.6.6, 203.0.113.9", socketAddress: "10.0.0.5", trustedHops: 1 })).toBe("203.0.113.9")
    expect(clientIp({ forwardedFor: "203.0.113.9", socketAddress: "10.0.0.5", trustedHops: 1 })).toBe("203.0.113.9")
  })
  it("takes the second from the right behind two proxies", () => {
    expect(clientIp({ forwardedFor: "6.6.6.6, 203.0.113.9, 10.1.1.1", socketAddress: "10.0.0.5", trustedHops: 2 })).toBe("203.0.113.9")
  })
  it("reads a header sent twice as one list", () => {
    expect(clientIp({ forwardedFor: ["6.6.6.6", "203.0.113.9"], socketAddress: "10.0.0.5", trustedHops: 1 })).toBe("203.0.113.9")
  })
  it("falls back to the socket when the header has fewer entries than proxies, or none", () => {
    expect(clientIp({ forwardedFor: "203.0.113.9", socketAddress: "10.0.0.5", trustedHops: 2 })).toBe("10.0.0.5")
    expect(clientIp({ forwardedFor: undefined, socketAddress: "10.0.0.5", trustedHops: 1 })).toBe("10.0.0.5")
    expect(clientIp({ forwardedFor: "", socketAddress: "10.0.0.5", trustedHops: 1 })).toBe("10.0.0.5")
  })
  it("stores IPv4 written as IPv6 as IPv4, and keeps real IPv6", () => {
    expect(clientIp({ forwardedFor: undefined, socketAddress: "::ffff:127.0.0.1", trustedHops: 0 })).toBe("127.0.0.1")
    expect(clientIp({ forwardedFor: "2001:db8::1", socketAddress: "::1", trustedHops: 1 })).toBe("2001:db8::1")
    expect(clientIp({ forwardedFor: undefined, socketAddress: "::1", trustedHops: 0 })).toBe("::1")
  })
  it("drops text that is not an address", () => {
    expect(clientIp({ forwardedFor: "not-an-ip", socketAddress: undefined, trustedHops: 1 })).toBeNull()
    expect(clientIp({ forwardedFor: undefined, socketAddress: undefined, trustedHops: 0 })).toBeNull()
    expect(clientIp({ forwardedFor: "1.2.3.4, <script>", socketAddress: "10.0.0.5", trustedHops: 1 })).toBeNull()
  })
})

describe("readTrustedProxyHops", () => {
  it("reads a whole number from 0 to 10, and anything else is 0", () => {
    expect(readTrustedProxyHops("1")).toBe(1)
    expect(readTrustedProxyHops(" 2 ")).toBe(2)
    expect(readTrustedProxyHops("10")).toBe(10)
    for (const v of [undefined, "", "x", "-1", "11", "1.5", "99"]) expect(readTrustedProxyHops(v)).toBe(0)
  })
})

const stored = (over: Partial<StoredProof> = {}): StoredProof => ({
  id: "proof_1",
  team_order_id: "teamord_1",
  proof_number: 2,
  status: "signed",
  design_version_id: "desver_1",
  list_version: 3,
  snapshot_text: '{"format":1,"lines":[]}',
  snapshot_hash: HASH,
  signed_name: "Ali Khan",
  signed_at: "2026-11-22T10:00:00.000Z",
  schedule_state: "ok",
  need_by_date: "2027-01-31",
  rush: false,
  promised_delivery_date: "2026-12-07",
  created_at: "2026-11-22T09:00:00.000Z",
  closed_at: null,
  ...over,
})

describe("proofToApi", () => {
  it("names the fields for the API and never carries an address", () => {
    const withIp = { ...stored(), signed_ip: "203.0.113.9", signed_by_customer_id: "cus_1" } as StoredProof
    const api = proofToApi(withIp)
    expect(api.number).toBe(2)
    expect(api.hash).toBe(HASH)
    expect(JSON.stringify(api)).not.toContain("203.0.113.9")
    expect(Object.keys(api)).not.toContain("signed_ip")
    expect(Object.keys(api)).not.toContain("snapshot_text")
  })
  it("shows an unsigned proof with nulls", () => {
    const api = proofToApi(stored({ status: "sent", signed_name: null, signed_at: null, schedule_state: null, rush: null, need_by_date: null, promised_delivery_date: null }))
    expect(api.signed_name).toBeNull()
    expect(api.signed_at).toBeNull()
    expect(api.promised_delivery_date).toBeNull()
  })
  it("adds the snapshot as an object and as the stored text", () => {
    const withSnap = proofWithSnapshot(stored())
    expect(withSnap.snapshot).toEqual({ format: 1, lines: [] })
    expect(withSnap.snapshot_text).toBe('{"format":1,"lines":[]}')
  })
})

describe("currentProofOf", () => {
  it("is the sent or signed proof, not a withdrawn or replaced one", () => {
    const list = [stored({ id: "p3", proof_number: 3, status: "sent" }), stored({ id: "p2", status: "replaced" }), stored({ id: "p1", status: "withdrawn" })]
    expect(currentProofOf(list)?.id).toBe("p3")
    expect(currentProofOf([stored({ status: "signed" })])?.status).toBe("signed")
    expect(currentProofOf([stored({ status: "replaced" })])).toBeNull()
    expect(currentProofOf([])).toBeNull()
  })
})
