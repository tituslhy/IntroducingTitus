import { dropCancelled, sumProgress, type FileProgress } from "@/lib/voice-reply/worker-logic";

describe("sumProgress", () => {
  it("adds up bytes across files into one loaded/total", () => {
    const files: FileProgress = {};
    expect(sumProgress(files, "model.onnx", 10, 100)).toEqual({ loaded: 10, total: 100 });
    expect(sumProgress(files, "tokenizer.json", 5, 20)).toEqual({ loaded: 15, total: 120 });
  });

  it("replaces a file's earlier numbers rather than adding to them", () => {
    const files: FileProgress = {};
    sumProgress(files, "model.onnx", 10, 100);
    expect(sumProgress(files, "model.onnx", 60, 100)).toEqual({ loaded: 60, total: 100 });
  });

  it("treats missing numbers as zero", () => {
    const files: FileProgress = {};
    expect(sumProgress(files, "a", undefined, undefined)).toEqual({ loaded: 0, total: 0 });
  });

  it("never lets a file's numbers go down, even when a later event is missing them", () => {
    const files: FileProgress = {};
    sumProgress(files, "model.onnx", 60, 100);
    expect(sumProgress(files, "model.onnx", undefined, undefined)).toEqual({ loaded: 60, total: 100 });
    expect(sumProgress(files, "model.onnx", 20, 50)).toEqual({ loaded: 60, total: 100 });
  });

  it("clamps loaded to at most total", () => {
    const files: FileProgress = {};
    expect(sumProgress(files, "model.onnx", 150, 100)).toEqual({ loaded: 100, total: 100 });
  });
});

describe("dropCancelled", () => {
  const job = (id: number) => ({ id, text: `s${id}` });

  it("drops queued sentences with id <= upTo and keeps the rest in order", () => {
    expect(dropCancelled([job(1), job(2), job(3), job(4)], 2).map((j) => j.id)).toEqual([3, 4]);
  });

  it("keeps everything when upTo is below every id", () => {
    expect(dropCancelled([job(5), job(6)], 4)).toHaveLength(2);
  });

  it("empties the queue when upTo covers every id", () => {
    expect(dropCancelled([job(1), job(2)], 9)).toEqual([]);
  });

  it("does not change the queue it is given", () => {
    const queue = [job(1), job(2)];
    dropCancelled(queue, 1);
    expect(queue).toHaveLength(2);
  });
});
