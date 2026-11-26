import { techKey } from "./tech-key";

describe("techKey", () => {
  it("lowercases a tech name", () => {
    expect(techKey("Docker")).toBe("docker");
    expect(techKey("LangChain")).toBe("langchain");
  });

  it("trims leading and trailing whitespace", () => {
    expect(techKey("  Python  ")).toBe("python");
    expect(techKey("\tRedis\n")).toBe("redis");
  });

  it("keeps internal spaces and punctuation so distinct tools stay distinct", () => {
    expect(techKey("Java (Spring Boot)")).toBe("java (spring boot)");
    expect(techKey("Helm Charts")).toBe("helm charts");
    expect(techKey("Docker+CUDA")).toBe("docker+cuda");
    expect(techKey("Docker+CUDA")).not.toBe(techKey("Docker"));
  });

  it("maps the same tool written in different case to one key", () => {
    expect(techKey("Docker")).toBe(techKey("DOCKER"));
    expect(techKey("vLLM")).toBe(techKey("vllm"));
    expect(techKey("GitHub Actions")).toBe(techKey("github actions"));
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(techKey("")).toBe("");
    expect(techKey("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = techKey("  Oracle DB ");
    expect(techKey(once)).toBe(once);
  });
});
