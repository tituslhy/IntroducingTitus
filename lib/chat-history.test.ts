import { fitHistory, type HistoryMessage } from "./chat-history";

type Msg = HistoryMessage;

const user = (content: string): Msg => ({ role: "user", content });
const reply = (content: string): Msg => ({ role: "assistant", content });
/** A string of exactly `n` characters, tagged so a test can tell messages apart. */
const sized = (tag: string, n: number) => tag.padEnd(n, ".");

const BIG = { maxMessages: 20, maxChars: 12_000 };

describe("fitHistory", () => {
  describe("the message window", () => {
    it("returns the conversation untouched when it is within the window and budget", () => {
      const all = [user("hi"), reply("hello"), user("bye")];

      const fitted = fitHistory(all, BIG);

      expect(fitted).toEqual({ messages: all, dropped: 0 });
    });

    it("keeps only the last maxMessages", () => {
      // 22 messages, every even index a visitor message. The window is the last 20: indexes 2..21.
      const all = Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? user(`m${i}`) : reply(`m${i}`)));

      const fitted = fitHistory(all, BIG)!;

      expect(fitted.messages).toHaveLength(20);
      expect(fitted.messages[0].content).toBe("m2");
      expect(fitted.messages.at(-1)!.content).toBe("m21");
      expect(fitted.dropped).toBe(0);
    });

    it("drops a leading assistant message that the window cut leaves at the front", () => {
      // 25 messages, visitor on even indexes. The last 20 start at index 5, which is a reply.
      const all = Array.from({ length: 25 }, (_, i) => (i % 2 === 0 ? user(`m${i}`) : reply(`m${i}`)));

      const fitted = fitHistory(all, BIG)!;

      expect(fitted.messages[0]).toEqual(user("m6"));
      expect(fitted.messages).toHaveLength(19);
      expect(fitted.dropped).toBe(1);
    });

    it("drops every leading assistant message, not just the first", () => {
      const all = [reply("a0"), reply("a1"), user("u2"), reply("a3")];

      const fitted = fitHistory(all, BIG)!;

      expect(fitted.messages).toEqual([user("u2"), reply("a3")]);
      expect(fitted.dropped).toBe(2);
    });

    it("counts the window cut in dropped when the window holds no visitor message at all", () => {
      const all = Array.from({ length: 25 }, () => reply("r"));

      expect(fitHistory(all, BIG)).toEqual({ messages: [], dropped: 20 });
    });

    it("returns no messages for an empty conversation", () => {
      expect(fitHistory([], BIG)).toEqual({ messages: [], dropped: 0 });
    });

    it("returns no messages, and drops what it saw, when there is only a reply", () => {
      expect(fitHistory([reply("a"), reply("b")], BIG)).toEqual({ messages: [], dropped: 2 });
    });

    it("counts only the window against the budget, so messages cut by the window do not cost anything", () => {
      // Five large messages fall outside the window; the 20 in the window total 2,000 characters.
      const all = Array.from({ length: 25 }, (_, i) => {
        const role = i < 5 ? (i % 2 === 0 ? "user" : "assistant") : i % 2 === 1 ? "user" : "assistant";
        return { role, content: i < 5 ? sized("big", 4000) : sized(`m${i}`, 100) } as Msg;
      });

      const fitted = fitHistory(all, BIG)!;

      expect(fitted.messages).toHaveLength(20);
      expect(fitted.messages[0].role).toBe("user");
      expect(fitted.dropped).toBe(0);
    });
  });

  describe("the character budget", () => {
    // Three exchanges of 300, 200 and 100 characters: E1 = u + 2 replies, E2 = u + reply, E3 = u.
    const exchanges = () => [
      user(sized("E1", 100)),
      reply(sized("E1-a", 100)),
      reply(sized("E1-b", 100)),
      user(sized("E2", 100)),
      reply(sized("E2-a", 100)),
      user(sized("E3", 100)),
    ];

    it("drops the oldest exchange, including all of its replies, when the conversation is over budget", () => {
      // 600 total. Dropping E1 (300) leaves 300, which fits 350.
      const fitted = fitHistory(exchanges(), { maxMessages: 20, maxChars: 350 })!;

      expect(fitted.messages.map((m) => m.content.slice(0, 2))).toEqual(["E2", "E2", "E3"]);
      expect(fitted.dropped).toBe(3);
    });

    it("stops as soon as the conversation fits, keeping the newer exchanges", () => {
      // Dropping E1 gives exactly 300, which fits 300: E2 must not be dropped too.
      const fitted = fitHistory(exchanges(), { maxMessages: 20, maxChars: 300 })!;

      expect(fitted.messages.map((m) => m.content.slice(0, 2))).toEqual(["E2", "E2", "E3"]);
      expect(fitted.dropped).toBe(3);
    });

    it("keeps dropping exchanges, oldest first, until the rest fit", () => {
      // 150 is less than E2 + E3 (300), so E2 goes too, leaving E3 (100).
      const fitted = fitHistory(exchanges(), { maxMessages: 20, maxChars: 150 })!;

      expect(fitted.messages).toEqual([user(sized("E3", 100))]);
      expect(fitted.dropped).toBe(5);
    });

    it("never drops the newest exchange, even when it is the only one left", () => {
      // The newest exchange (100) fits 100 exactly, so it is kept, and nothing newer is ever dropped.
      const fitted = fitHistory(exchanges(), { maxMessages: 20, maxChars: 100 })!;

      expect(fitted.messages).toEqual([user(sized("E3", 100))]);
    });

    it("keeps the replies after the newest visitor message along with it", () => {
      const all = [user("old".padEnd(100, ".")), user(sized("new", 50)), reply(sized("new-reply", 50))];

      const fitted = fitHistory(all, { maxMessages: 20, maxChars: 100 })!;

      expect(fitted.messages).toEqual([user(sized("new", 50)), reply(sized("new-reply", 50))]);
      expect(fitted.dropped).toBe(1);
    });

    it("returns the whole conversation when it is exactly at the budget", () => {
      const all = [user(sized("u", 100)), reply(sized("r", 100))];

      expect(fitHistory(all, { maxMessages: 20, maxChars: 200 })).toEqual({ messages: all, dropped: 0 });
    });

    it("returns null when the newest exchange alone is over budget", () => {
      expect(fitHistory([user(sized("only", 200))], { maxMessages: 20, maxChars: 100 })).toBeNull();
    });

    it("returns null when the newest exchange's replies together push it over budget", () => {
      const all = [user(sized("u", 50)), reply(sized("a", 60)), reply(sized("b", 60)), reply(sized("c", 60))];

      expect(fitHistory(all, { maxMessages: 20, maxChars: 100 })).toBeNull();
    });

    it("returns null, not a partial history, when even the newest exchange cannot fit after older ones are dropped", () => {
      const all = [user(sized("old", 10)), reply(sized("old-r", 10)), user(sized("new", 200))];

      expect(fitHistory(all, { maxMessages: 20, maxChars: 100 })).toBeNull();
    });
  });

  it("keeps the caller's message type, including extra fields, and the same objects", () => {
    type Stored = Msg & { id: string };
    const first: Stored = { role: "user", content: "hi", id: "m1" };
    const second: Stored = { role: "assistant", content: "hello", id: "m2" };
    const latest: Stored = { role: "user", content: "again", id: "m3" };

    const fitted = fitHistory([first, second, latest], BIG)!;

    expect(fitted.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(fitted.messages[0]).toBe(first);
  });
});
