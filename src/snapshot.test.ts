import { describe, expect, it } from "vitest";
import { emptySnapshot } from "./bridge";
import type { Snapshot } from "./bridge";
import { reconcileSnapshot } from "./snapshot";

describe("native snapshot reconciliation", () => {
  it("preserves equal connection settings and accepts a changed model", () => {
    const before = structuredClone(emptySnapshot);
    before.settings.aiConnection = {provider:"claude",model:"model-one",endpoint:"https://api.anthropic.com/v1/messages",protocol:"anthropic",workspace:""};
    expect(reconcileSnapshot(before, structuredClone(before))).toBe(before);
    const changed = structuredClone(before);
    changed.settings.aiConnection!.model = "model-two";
    expect(reconcileSnapshot(before, changed).settings.aiConnection?.model).toBe("model-two");
  });
  const initial = () => ({...structuredClone(emptySnapshot), tabs:[{id:"a",title:"A",url:"https://a.test"}], history:[{id:1,title:"A",url:"https://a.test"}]});
  it("ignores identical payloads and preserves unrelated branches on download progress", () => {
    const before = initial();
    expect(reconcileSnapshot(before, structuredClone(before))).toBe(before);
    const incoming = {...structuredClone(before), downloads:[{id:"d",name:"File",url:"https://a.test/file",status:"running",receivedBytes:100}]};
    const next = reconcileSnapshot(before, incoming);
    expect(next.downloads).toEqual(incoming.downloads);
    expect(next.tabs).toBe(before.tabs);
    expect(next.history).toBe(before.history);
    expect(next.settings).toBe(before.settings);
    expect(before.downloads).toEqual([]);
  });
  it("retains omitted libraries but accepts clearing, reorder and changed titles", () => {
    const before = initial();
    const partial = {...structuredClone(before), history:undefined, bookmarks:undefined} as unknown as Snapshot;
    expect(reconcileSnapshot(before, partial).history).toBe(before.history);
    expect(reconcileSnapshot(before, {...partial, history:[]}).history).toEqual([]);
    const changed = {...structuredClone(before), tabs:[{...before.tabs[0],title:"Updated"}]};
    expect(reconcileSnapshot(before, changed).tabs[0].title).toBe("Updated");
    expect(before.tabs[0].title).toBe("A");
  });
});
