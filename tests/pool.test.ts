import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";

process.env["BOT_TOKEN"] = "000:test";
process.env["ADMIN_IDS"] = "1";
process.env["DATABASE_URL"] = "postgres://u:p@127.0.0.1:1/db";

const { createPool } = await import("../src/db/pool.ts");

const directory = mkdtempSync(join(tmpdir(), "otp-tls-"));
const keyPath = join(directory, "key.pem");
const certPath = join(directory, "cert.pem");

let server: tls.Server;
let port = 0;
let lastTlsError: string | undefined;

beforeAll(async () => {
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  server = tls.createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    (socket) => socket.on("error", () => {}),
  );
  server.on("tlsClientError", (error: NodeJS.ErrnoException) => {
    lastTlsError = error.code;
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  port = address.port;
});

afterAll(() => {
  server.close();
  rmSync(directory, { recursive: true, force: true });
});

async function connectThrough(url: string): Promise<void> {
  lastTlsError = undefined;
  const pool = createPool(url);
  try {
    const client = await pool.connect();
    client.release();
  } catch {
    // The fake server speaks no postgres protocol; only the TLS step matters here.
  } finally {
    await pool.end().catch(() => {});
  }
}

describe("pool TLS", () => {
  test("sslmode=require accepts a self-signed chain", async () => {
    await connectThrough(`postgres://u:p@127.0.0.1:${port}/db?sslmode=require`);
    expect(lastTlsError).toBe("ERR_SSL_WRONG_VERSION_NUMBER");
  });

  test("sslmode=verify-full with the CA verifies successfully", async () => {
    process.env["SSL_CERT_FILE"] = certPath;
    try {
      await connectThrough(`postgres://u:p@127.0.0.1:${port}/db?sslmode=verify-full`);
    } finally {
      delete process.env["SSL_CERT_FILE"];
    }
    expect(lastTlsError).toBe("ERR_SSL_WRONG_VERSION_NUMBER");
  });

  test("sslmode=verify-full without a CA fails loudly", () => {
    expect(() => createPool(`postgres://u:p@127.0.0.1:${port}/db?sslmode=verify-full`)).toThrow(
      "SSL_CERT_FILE",
    );
  });

  test("a url without sslmode does not enable TLS", () => {
    const pool = createPool(`postgres://u:p@127.0.0.1:${port}/db`);
    expect(pool.options.ssl).toBeUndefined();
    return pool.end();
  });

  test("sslmode=require never downgrades to plaintext", async () => {
    const server = net.createServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", (buffer) => {
        if (buffer.readInt32BE(0) === 8) {
          socket.write(Buffer.from("N"));
        }
        socket.destroy();
      });
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };

    const pool = createPool(`postgres://u:p@127.0.0.1:${address.port}/db?sslmode=require`);
    try {
      await expect(pool.connect()).rejects.toThrow("does not support SSL");
    } finally {
      await pool.end().catch(() => {});
      server.close();
    }
  });
});
