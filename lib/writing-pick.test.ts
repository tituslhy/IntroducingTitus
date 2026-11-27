import { MAX_PICK, PICK_PARAM, parsePick, pickHref, pickQuestion, rememberPickQuestion, toPick } from "./writing-pick";

const IDS = ["0000000a", "00000001", "1c16fb47f435"];

describe("PICK_PARAM and MAX_PICK", () => {
  it("names the query parameter read, and holds at most twelve articles", () => {
    expect(PICK_PARAM).toBe("read");
    expect(MAX_PICK).toBe(12);
  });
});

describe("pickHref", () => {
  it("is the Writing page with the ids in the read parameter, comma-separated, in the order given", () => {
    expect(pickHref(IDS)).toBe("/writing?read=0000000a,00000001,1c16fb47f435");
  });

  it("is the bare Writing page filter with one id", () => {
    expect(pickHref(["00000001"])).toBe("/writing?read=00000001");
  });
});

describe("parsePick", () => {
  it("returns the ids in the order given", () => {
    expect(parsePick("0000000a,00000001")).toEqual(["0000000a", "00000001"]);
  });

  it("returns an empty list for a missing, null or empty value", () => {
    expect(parsePick(undefined)).toEqual([]);
    expect(parsePick(null)).toEqual([]);
    expect(parsePick("")).toEqual([]);
  });

  it("drops anything that is not a well-formed post id", () => {
    // Too short (7), too long (17), not hex, a path, and a script all go; the good ones stay.
    expect(parsePick("1234567,12345678,123456789012345678,zzzzzzzz,../../etc,<script>,1c16fb47f435")).toEqual([
      "12345678",
      "1c16fb47f435",
    ]);
  });

  it("accepts ids of eight to sixteen hex characters, at both ends", () => {
    expect(parsePick("12345678")).toEqual(["12345678"]);
    expect(parsePick("1234567890abcdef")).toEqual(["1234567890abcdef"]);
    expect(parsePick("1234567890abcdef0")).toEqual([]);
  });

  it("trims spaces and lowercases each id before checking it", () => {
    expect(parsePick(" 0000000A , 1C16FB47F435 ")).toEqual(["0000000a", "1c16fb47f435"]);
  });

  it("drops a repeated id, keeping its first position", () => {
    expect(parsePick("00000001,0000000a,00000001")).toEqual(["00000001", "0000000a"]);
  });

  it("keeps at most twelve ids", () => {
    const many = Array.from({ length: 15 }, (_, i) => (0x10 + i).toString(16).padStart(8, "0")).join(",");
    const out = parsePick(many);
    expect(out).toHaveLength(MAX_PICK);
    expect(out[0]).toBe("00000010");
    expect(out[11]).toBe("0000001b");
  });
});

describe("toPick", () => {
  it("returns the well-formed ids from a streamed pick event", () => {
    expect(toPick({ articles: ["0000000a", "00000001"] })).toEqual(["0000000a", "00000001"]);
  });

  it("returns null when articles is missing or not an array", () => {
    expect(toPick({})).toBeNull();
    expect(toPick({ articles: "0000000a" })).toBeNull();
    expect(toPick({ articles: 7 })).toBeNull();
  });

  it("returns null when no id is well formed", () => {
    expect(toPick({ articles: ["nope", "../x"] })).toBeNull();
    expect(toPick({ articles: [] })).toBeNull();
  });

  it("ignores items that are not strings, and keeps the good ones", () => {
    expect(toPick({ articles: [null, 3, "00000001", { id: "0000000a" }] })).toEqual(["00000001"]);
  });

  it("caps the ids the same way parsePick does", () => {
    const articles = Array.from({ length: 20 }, (_, i) => (0x20 + i).toString(16).padStart(8, "0"));
    expect(toPick({ articles })).toHaveLength(MAX_PICK);
  });
});

describe("rememberPickQuestion and pickQuestion", () => {
  beforeEach(() => {
    // Clears whatever an earlier test remembered: a blank question forgets it.
    rememberPickQuestion([], "");
  });

  it("returns the question that made this pick, for the same ids", () => {
    rememberPickQuestion(IDS, "Which of your articles should I read first?");
    expect(pickQuestion(IDS)).toBe("Which of your articles should I read first?");
  });

  it("returns null for a different set of ids, so a shared link never shows another question", () => {
    rememberPickQuestion(IDS, "Which of your articles should I read first?");
    expect(pickQuestion(["00000001"])).toBeNull();
    expect(pickQuestion([...IDS].reverse())).toBeNull();
  });

  it("remembers only the latest question: an earlier pick's question is forgotten", () => {
    rememberPickQuestion(IDS, "First question?");
    rememberPickQuestion(["00000001"], "Second question?");
    expect(pickQuestion(IDS)).toBeNull();
    expect(pickQuestion(["00000001"])).toBe("Second question?");
  });

  it("collapses the spaces and trims the question", () => {
    rememberPickQuestion(IDS, "   What  about\n\tRAG?  ");
    expect(pickQuestion(IDS)).toBe("What about RAG?");
  });

  it("keeps at most 200 characters of the question", () => {
    rememberPickQuestion(IDS, "word ".repeat(100));
    expect(pickQuestion(IDS)!.length).toBe(200);
  });

  it("forgets the question when it is blank", () => {
    rememberPickQuestion(IDS, "A question");
    rememberPickQuestion(IDS, "   ");
    expect(pickQuestion(IDS)).toBeNull();
  });

  it("returns null when nothing was remembered", () => {
    expect(pickQuestion(IDS)).toBeNull();
  });
});
