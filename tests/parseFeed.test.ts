import { describe, it, expect } from "vitest";
import { parsePrefetchedMessages, detectFeed } from "../src/gmail/parseFeed";

// Synthetic /i/fd feeds mirroring the structure observed live (docs/SPIKE.md):
//   root[1] = threads; thread[2] = messages; a message array carries its
//   16-hex legacy id as a direct child and its body HTML nested deep at
//   ...[1][5][1][part][2][1]. The segmenter is path-independent, so we only
//   reproduce the *relationships* (hex id as direct child of the message array,
//   bodies nested somewhere beneath), not Gmail's exact indices.

const TRACKED_BODY =
  '<div dir="ltr"><p>Hi, following up on our conversation earlier this week.</p>' +
  '<img src="https://ci3.googleusercontent.com/proxy/z=s0-d-e1-ft#https://mailtrack.io/trace/mail/deadbeefcafe1234.png"' +
  ' width="1" height="1" style="display:none"></div>';

const CLEAN_BODY =
  '<div dir="ltr"><p>Just a normal note with no tracking of any kind here, friend.</p></div>';

// message: hex id as a direct child; body(s) nested at [1][5][1][part][2][1].
function message(hexId: string, ...bodies: string[]) {
  const parts = bodies.map((b) => [0, 0, [0, b]]);
  const bodyContainer = [0, 0, 0, 0, 0, [0, parts]];
  return ["hdr", bodyContainer, hexId];
}
function thread(...messages: unknown[]) {
  return [0, 0, messages];
}
function root(...threads: unknown[]) {
  return [0, threads];
}
function feed(...roots: unknown[]): string {
  if (roots.length === 1) return ")]}'\n\n" + JSON.stringify(roots[0]);
  // chunked / length-prefixed form
  return (
    ")]}'\n\n" +
    roots.map((r) => `${JSON.stringify(r).length}\n${JSON.stringify(r)}`).join("\n")
  );
}

const ID_A = "19f69ab0cd0015df";
const ID_B = "19f26aa0bb002261";
const ID_C = "19e5dcc0dd00795d";

describe("parsePrefetchedMessages", () => {
  it("extracts a single message's body keyed by its 16-hex id", () => {
    const msgs = parsePrefetchedMessages(feed(root(thread(message(ID_A, TRACKED_BODY)))));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe(ID_A);
    expect(msgs[0].html).toContain("mailtrack.io");
  });

  it("concatenates multiple body parts of one message under a single id", () => {
    const msgs = parsePrefetchedMessages(
      feed(root(thread(message(ID_A, CLEAN_BODY, TRACKED_BODY)))),
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe(ID_A);
    expect(msgs[0].html).toContain("no tracking of any kind");
    expect(msgs[0].html).toContain("mailtrack.io");
  });

  it("separates distinct messages by their ids, across threads", () => {
    const msgs = parsePrefetchedMessages(
      feed(
        root(
          thread(message(ID_A, TRACKED_BODY), message(ID_B, CLEAN_BODY)),
          thread(message(ID_C, CLEAN_BODY)),
        ),
      ),
    );
    expect(msgs.map((m) => m.messageId).sort()).toEqual([ID_A, ID_B, ID_C].sort());
  });

  it("handles chunked / length-prefixed multi-block responses", () => {
    const raw = feed(
      root(thread(message(ID_A, TRACKED_BODY))),
      root(thread(message(ID_B, CLEAN_BODY))),
    );
    const msgs = parsePrefetchedMessages(raw);
    expect(msgs.map((m) => m.messageId).sort()).toEqual([ID_A, ID_B].sort());
  });

  it("returns nothing for a body-less feed", () => {
    expect(parsePrefetchedMessages(feed(root(thread(message(ID_A)))))).toEqual([]);
  });
});

describe("detectFeed", () => {
  it("maps each message id to its verdict", () => {
    const verdicts = detectFeed(
      feed(root(thread(message(ID_A, TRACKED_BODY), message(ID_B, CLEAN_BODY)))),
    );
    expect(verdicts.get(ID_A)?.tracked).toBe(true);
    expect(verdicts.get(ID_A)?.trackers[0].name).toBe("Mailsuite");
    expect(verdicts.get(ID_B)?.tracked).toBe(false);
  });
});
