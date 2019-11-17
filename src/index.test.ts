import fs from "fs";
import stream from "stream";
import test from "ava";
import { ReadAfterDestroyedError, WriteStream } from "./index";
import { Readable } from "stream";

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGHUP", () => process.exit(0));

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    let ended = false;
    let data = "";
    stream
      .on("error", reject)
      .on("data", chunk => {
        if (ended) throw new Error("`data` emitted after `end`");
        data += chunk;
      })
      .on("end", () => {
        ended = true;
        resolve(data);
      });
  });
}

function waitForBytesWritten(
  stream: WriteStream,
  bytes: number,
  resolve: () => void
): void {
  if (stream["_pos"] >= bytes) {
    setImmediate(resolve);
    return;
  }

  setImmediate(() => waitForBytesWritten(stream, bytes, resolve));
}

test("Data from a complete stream.", async t => {
  let data = "";
  const source = new stream.Readable({
    read() {
      // Intentionally not implementing anything here.
    }
  });

  // Add the first chunk of data (without any consumer)
  const chunk1 = "1".repeat(10);
  source.push(chunk1);
  source.push(null);
  data += chunk1;

  // Create a new capacitor
  const capacitor1 = new WriteStream();
  t.is(capacitor1["_readStreams"].size, 0, "should start with 0 read streams");

  // Pipe data to the capacitor
  source.pipe(capacitor1);

  // Attach a read stream
  const capacitor1Stream1 = capacitor1.createReadStream("capacitor1Stream1");
  t.is(
    capacitor1["_readStreams"].size,
    1,
    "should attach a new read stream before receiving data"
  );

  // Wait until capacitor is finished writing all data
  const result = await streamToString(capacitor1Stream1);
  t.is(result, data, "should stream all data");
  t.is(
    capacitor1["_readStreams"].size,
    0,
    "should no longer have any attacheds read streams"
  );
});

test("Data from an open stream, 1 chunk, no read streams.", async t => {
  let data = "";
  const source = new stream.Readable({
    read() {
      // Intentionally not implementing anything here.
    }
  });

  // Create a new capacitor
  const capacitor1 = new WriteStream();
  t.is(capacitor1["_readStreams"].size, 0, "should start with 0 read streams");

  // Pipe data to the capacitor
  source.pipe(capacitor1);

  // Add the first chunk of data (without any read streams)
  const chunk1 = "1".repeat(10);
  source.push(chunk1);
  source.push(null);
  data += chunk1;

  // Attach a read stream
  const capacitor1Stream1 = capacitor1.createReadStream("capacitor1Stream1");
  t.is(
    capacitor1["_readStreams"].size,
    1,
    "should attach a new read stream before receiving data"
  );

  // Wait until capacitor is finished writing all data
  const result = await streamToString(capacitor1Stream1);
  t.is(result, data, "should stream all data");
  t.is(
    capacitor1["_readStreams"].size,
    0,
    "should no longer have any attacheds read streams"
  );
});

test("Data from an open stream, 1 chunk, 1 read stream.", async t => {
  let data = "";
  const source = new stream.Readable({
    read() {
      // Intentionally not implementing anything here.
    }
  });

  // Create a new capacitor
  const capacitor1 = new WriteStream();
  t.is(capacitor1["_readStreams"].size, 0, "should start with 0 read streams");

  // Pipe data to the capacitor
  source.pipe(capacitor1);

  // Attach a read stream
  const capacitor1Stream1 = capacitor1.createReadStream("capacitor1Stream1");
  t.is(
    capacitor1["_readStreams"].size,
    1,
    "should attach a new read stream before receiving data"
  );

  // Add the first chunk of data (with 1 read stream)
  const chunk1 = "1".repeat(10);
  source.push(chunk1);
  source.push(null);
  data += chunk1;

  // Wait until capacitor is finished writing all data
  const result = await streamToString(capacitor1Stream1);
  t.is(result, data, "should stream all data");
  t.is(
    capacitor1["_readStreams"].size,
    0,
    "should no longer have any attacheds read streams"
  );
});

test("Destroy with error.", async t => {
  const capacitor2 = new WriteStream();
  const capacitor2Stream1 = capacitor2.createReadStream("capacitor2Stream1");
  const capacitor2Stream2 = capacitor2.createReadStream("capacitor2Stream2");

  const capacitor2ReadStream1Destroyed = new Promise(resolve =>
    capacitor2Stream1.on("close", resolve)
  );
  const capacitor2Destroyed = new Promise(resolve =>
    capacitor2.on("close", resolve)
  );

  capacitor2Stream1.destroy();
  await capacitor2ReadStream1Destroyed;

  const error = new Error("test");
  let capacitor2Stream2Error;
  capacitor2Stream2.on("error", (error: Error) => {
    capacitor2Stream2Error = error;
  });
  let capacitor2Error;
  capacitor2.on("error", (error: Error) => {
    capacitor2Error = error;
  });
  capacitor2.destroy(error);
  await capacitor2Destroyed;

  t.is(capacitor2.destroyed, true, "should mark capacitor as destroyed");
  t.is(
    capacitor2Stream2.destroyed,
    true,
    "should mark attached read streams as destroyed"
  );
  t.is(
    capacitor2Stream2Error,
    error,
    "should emit the original error on read stream"
  );
  t.is(
    capacitor2Error,
    error,
    "should emit the original error on write stream"
  );
});

test("Destroy without error.", async t => {
  const capacitor3 = new WriteStream();
  const capacitor3Stream1 = capacitor3.createReadStream("capacitor3Stream1");
  const capacitor3Stream2 = capacitor3.createReadStream("capacitor3Stream2");

  const capacitor3ReadStream1Destroyed = new Promise(resolve =>
    capacitor3Stream1.on("close", resolve)
  );
  const capacitor3Destroyed = new Promise(resolve =>
    capacitor3.on("close", resolve)
  );

  capacitor3Stream1.destroy();
  await capacitor3ReadStream1Destroyed;

  let capacitor3Stream2Error;
  capacitor3Stream2.on("error", (error: Error) => {
    capacitor3Stream2Error = error;
  });
  let capacitor3Error;
  capacitor3.on("error", (error: Error) => {
    capacitor3Error = error;
  });
  capacitor3.destroy();
  await capacitor3Destroyed;

  t.is(capacitor3.destroyed, true, "should mark capacitor as destroyed");
  t.is(
    capacitor3Stream2.destroyed,
    true,
    "should mark attached read streams as destroyed"
  );
  t.is(
    capacitor3Stream2Error,
    undefined,
    "should not emit an error on read stream"
  );
  t.is(capacitor3Error, undefined, "should not emit am error on write stream");
});

function withChunkSize(size: number): void {
  test(`End-to-end with chunk size: ${size}`, async t => {
    let data = "";
    const source = new stream.Readable({
      read() {
        // Intentionally not implementing anything here.
      }
    });

    // Create a new capacitor and read stream before any data has been written.
    let capacitor1Closed = false;
    const capacitor1 = new WriteStream();
    capacitor1.on("close", () => (capacitor1Closed = true));
    t.is(
      capacitor1["_readStreams"].size,
      0,
      "should start with 0 read streams"
    );
    const capacitor1Stream1 = capacitor1.createReadStream("capacitor1Stream1");
    t.is(
      capacitor1["_readStreams"].size,
      1,
      "should attach a new read stream before receiving data"
    );

    // Make sure a temporary file was created.
    await new Promise(resolve => capacitor1.on("ready", resolve));
    const path = capacitor1["_path"] as string;
    const fd = capacitor1["_fd"] as number;
    t.is(
      typeof capacitor1["_path"],
      "string",
      "capacitor1._path should be a string"
    );
    t.is(typeof fd, "number", "capacitor1._fd should be a number");
    t.is(fs.existsSync(path), true, "creates a temp file");

    // Pipe data to the capacitor.
    source.pipe(capacitor1);

    // Add the first chunk of data (without any read streams).
    const chunk1 = "1".repeat(size);
    source.push(chunk1);
    data += chunk1;

    // Wait until this chunk has been written to the buffer
    await new Promise(resolve =>
      waitForBytesWritten(capacitor1, size, resolve)
    );

    // Create a new stream after some data has been written.
    const capacitor1Stream2 = capacitor1.createReadStream("capacitor1Stream2");
    t.is(
      capacitor1["_readStreams"].size,
      2,
      "should attach a new read stream after first write"
    );

    const writeEventBytesWritten = new Promise(resolve => {
      capacitor1.once("write", () => {
        resolve(capacitor1["_pos"]);
      });
    });

    // Add a second chunk of data
    const chunk2 = "2".repeat(size);
    source.push(chunk2);
    data += chunk2;

    // Wait until this chunk has been written to the buffer
    await new Promise(resolve =>
      waitForBytesWritten(capacitor1, 2 * size, resolve)
    );

    // Make sure write event is called after bytes are written to the filesystem
    t.is(
      await writeEventBytesWritten,
      2 * size,
      "bytesWritten should include new chunk"
    );

    // End the source & wait until capacitor is finished.
    const finished = new Promise(resolve => capacitor1.once("finish", resolve));
    source.push(null);
    await finished;

    // Create a new stream after the source has ended.
    const capacitor1Stream3 = capacitor1.createReadStream("capacitor1Stream3");
    const capacitor1Stream4 = capacitor1.createReadStream("capacitor1Stream4");
    t.is(
      capacitor1["_readStreams"].size,
      4,
      "should attach new read streams after end"
    );

    // Make sure complete data is sent to a read stream.
    const result2 = await streamToString(capacitor1Stream2);
    t.is(
      (capacitor1Stream2 as any)._readableState.ended,
      true,
      "should mark read stream as ended"
    );
    t.is(result2, data, "should stream complete data");

    const result4 = await streamToString(capacitor1Stream4);
    t.is(
      (capacitor1Stream4 as any)._readableState.ended,
      true,
      "should mark read stream as ended"
    );
    t.is(result4, data, "should stream complete data");

    t.is(
      capacitor1["_readStreams"].size,
      2,
      "should detach an ended read stream"
    );

    // Make sure a read stream can be destroyed.
    await new Promise(resolve => {
      capacitor1Stream1.once("error", resolve);
      capacitor1Stream1.destroy(new Error("test"));
    });
    t.is(
      capacitor1Stream1.destroyed,
      true,
      "should mark read stream as destroyed"
    );
    t.is(
      capacitor1["_readStreams"].size,
      1,
      "should detach a destroyed read stream"
    );

    // Release the capacitor.
    capacitor1.release();

    t.is(
      capacitor1Closed,
      false,
      "should not destroy while read streams exist"
    );
    t.true(capacitor1["_released"], "should mark for future destruction");

    // Make sure the capacitor is destroyed once no read streams exist
    const readStreamDestroyed = new Promise(resolve =>
      capacitor1Stream3.on("close", resolve)
    );
    const capacitorDestroyed = new Promise(resolve =>
      capacitor1.on("close", resolve)
    );
    capacitor1Stream3.destroy();
    await readStreamDestroyed;
    t.is(
      capacitor1Stream3.destroyed,
      true,
      "should mark read stream as destroyed"
    );
    t.is(
      capacitor1["_readStreams"].size,
      0,
      "should detach a destroyed read stream"
    );
    await capacitorDestroyed;
    t.is(capacitor1Closed, true, "should mark capacitor as closed");
    t.is(capacitor1["_fd"], null, "should set fd to null");
    t.is(capacitor1.destroyed, true, "should mark capacitor as destroyed");
    t.is(
      fs.existsSync(capacitor1["_path"] as string),
      false,
      "removes its temp file"
    );

    // Make sure a new read stream cannot be created after destruction
    try {
      capacitor1.createReadStream();
      throw new Error();
    } catch (error) {
      t.is(
        error instanceof ReadAfterDestroyedError,
        true,
        "should not create a read stream once destroyed"
      );
    }
  });
}

// Test with small (sub-highWaterMark, 16384) chunks
withChunkSize(10);

// Test with large (above-highWaterMark, 16384) chunks
withChunkSize(100000);
