import { describe, expect, test } from "vitest";
import { GraphStore } from "./graph-store.js";
import type { Edge, UnresolvedRef } from "../indexer/types.js";

const A = "a".repeat(32);
const B = "b".repeat(32);
const X = "x".repeat(32);

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
