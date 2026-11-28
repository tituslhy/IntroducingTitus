// Safari can't `for await` over a ReadableStream (no ReadableStream.prototype[Symbol.asyncIterator]). kokoro-js's
// phonemizer does exactly that to unpack its espeak dictionary, so in Safari the first sentence waits forever (found
// on Titus's iPhone in the spike: the model loaded, then nothing). Imported by the worker before kokoro-js.

type IterableStream = ReadableStream & { [Symbol.asyncIterator]?: () => AsyncIterator<unknown> };

const proto = ReadableStream.prototype as IterableStream;

if (typeof proto[Symbol.asyncIterator] !== "function") {
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

export {};
