import { describe, expect, test } from "vitest";
import { GraphStore } from "./graph-store.js";
import type { Edge, UnresolvedRef } from "../indexer/types.js";

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);
const X = "x".repeat(32);
const MANY_TARGET_GUIDS = [
  C,
  ...Array.from({ length: 39_999 }, (_, index) => (index + 1).toString(16).padStart(32, "0")),
];

function edge(over: Partial<Edge> & Pick<Edge, "fromGuid" | "toGuid">): Edge {
  return { refKind: "SERIALIZED_REF", fileId: null, context: "ref", count: 1, ...over };
}

describe("deleteOutgoing", () => {
  test("removes edges and unresolved originating from the given guids", () => {
    const store = GraphStore.open(":memory:");
    store.insertEdges([edge({ fromGuid: A, toGuid: B }), edge({ fromGuid: X, toGuid: B })]);
    store.insertUnresolved([{ fromGuid: A, toGuid: "z".repeat(32), context: "c" }]);
    store.deleteOutgoing([A]);
    expect(store.edgeCount()).toBe(1); // X->B survives
    expect(store.unresolvedCount()).toBe(0);
    store.close();
  });
});

describe("demoteIncomingToUnresolved", () => {
  test("converts edges pointing at a guid into unresolved refs", () => {
    const store = GraphStore.open(":memory:");
    store.insertEdges([edge({ fromGuid: A, toGuid: X, context: "m_Script" })]);
    store.demoteIncomingToUnresolved(X);
    expect(store.edgeCount()).toBe(0);
    expect(store.unresolvedCount()).toBe(1);
    store.close();
  });
});

describe("promoteUnresolved", () => {
  test("converts unresolved refs to a guid into typed edges", () => {
    const store = GraphStore.open(":memory:");
    const refs: UnresolvedRef[] = [{ fromGuid: A, toGuid: X, context: "m_Materials" }];
    store.insertUnresolved(refs);
    store.promoteUnresolved(X, "USES_MATERIAL");
    expect(store.unresolvedCount()).toBe(0);
    expect(store.edgeCount()).toBe(1);
    store.close();
  });
});

describe("source guid lookups", () => {
  test("returns distinct sources with incoming edges to any target", () => {
    const store = GraphStore.open(":memory:");
    store.insertEdges([
      edge({ fromGuid: A, toGuid: X, context: "first" }),
      edge({ fromGuid: A, toGuid: X, context: "second" }),
      edge({ fromGuid: B, toGuid: X }),
    ]);

    expect(store.incomingSourceGuids([X])).toEqual([A, B]);
    expect(store.incomingSourceGuids([])).toEqual([]);
    store.close();
  });

  test("returns distinct sources with unresolved references to any target", () => {
    const store = GraphStore.open(":memory:");
    store.insertUnresolved([
      { fromGuid: A, toGuid: X, context: "first" },
      { fromGuid: A, toGuid: X, context: "second" },
      { fromGuid: B, toGuid: X, context: "ref" },
    ]);

    expect(store.unresolvedSourceGuids([X])).toEqual([A, B]);
    expect(store.unresolvedSourceGuids([])).toEqual([]);
    store.close();
  });

  test("finds incoming sources when the target list exceeds SQLite's variable limit", () => {
    const store = GraphStore.open(":memory:");
    store.insertEdges([edge({ fromGuid: A, toGuid: C })]);

    expect(store.incomingSourceGuids(MANY_TARGET_GUIDS)).toEqual([A]);
    store.close();
  });

  test("finds unresolved sources when the target list exceeds SQLite's variable limit", () => {
    const store = GraphStore.open(":memory:");
    store.insertUnresolved([{ fromGuid: B, toGuid: C, context: "ref" }]);

    expect(store.unresolvedSourceGuids(MANY_TARGET_GUIDS)).toEqual([B]);
    store.close();
  });
});
