/// <reference types="node" />
// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { it, expect, vi, afterEach } from "vitest";
import { integrationRoute } from "./_integration";
import { onRequest } from "./_middleware";
import { sign, VERSION } from "../shared/ecosystem-contract";
import type { AppEnv } from "./_utils";
const dbs: DatabaseSync[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  dbs.splice(0).forEach((d) => d.close());
});
function setup() {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  for (const f of ["0001_editorial_documents", "0005_editorial_originals"])
    db.exec(readFileSync(`migrations/${f}.sql`, "utf8"));
  const adapter = {
    prepare: (sql: string) => ({
      bind: (...args: SQLInputValue[]) => ({
        first: async () => db.prepare(sql).get(...args) || null,
        run: async () => ({
          meta: { changes: Number(db.prepare(sql).run(...args).changes) },
        }),
      }),
    }),
  };
  const env = {
    DB: adapter,
    ECOSYSTEM_SECRET: "isolated-crm-integration-secret-".repeat(2),
  } as unknown as AppEnv;
  const a = {
    version: VERSION,
    slug: "artigo",
    sha: "a".repeat(40),
    title: "Título & texto",
    summary: "Resumo real",
    category: "processo",
    url: "https://marioserafim.com.br/blog/artigo",
    cover: null,
    publishAt: "2026-01-01T13:00:00.000Z",
  };
  const request = async (
    data: unknown = a,
    path = "/integration/v1/newsletter-drafts",
  ) =>
    sign(
      new Request("https://crm.marioserafim.com.br" + path, {
        method: "POST",
        body: JSON.stringify(data),
      }),
      env.ECOSYSTEM_SECRET!,
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("No provider calls permitted");
    }),
  );
  return { db, env, a, request };
}
it("creates native GrapesJS draft using existing persistence and preserves manually edited retries", async () => {
  const { db, env, request } = setup();
  const response = await integrationRoute(await request(), env);
  expect(response.status).toBe(200);
  const a = (await response.json()) as any;
  const row = db
    .prepare("SELECT * FROM editorial_documents WHERE id=?")
    .get(a.id) as any;
  const payload = JSON.parse(row.payload);
  expect(payload.schemaVersion).toBe(3);
  expect(payload.status).toBe("draft");
  expect(payload.templateId).toBe("blog");
  expect(payload.buttondownId).toBeUndefined();
  expect(payload.content).toContain("Título &amp; texto");
  payload.subject = "Edited by human";
  db.prepare(
    "UPDATE editorial_documents SET payload=?,version=version+1 WHERE id=?",
  ).run(JSON.stringify(payload), a.id);
  const retry = (await (
    await integrationRoute(await request(), env)
  ).json()) as any;
  expect(retry.id).toBe(a.id);
  expect(
    JSON.parse(
      (
        db
          .prepare("SELECT payload FROM editorial_documents WHERE id=?")
          .get(a.id) as any
      ).payload,
    ).subject,
  ).toBe("Edited by human");
  expect(fetch).not.toHaveBeenCalled();
});
it("deduplicates concurrent creation and keeps a separate version", async () => {
  const { db, env, a, request } = setup();
  const requests = await Promise.all([request(), request()]);
  const results = await Promise.all(
    requests.map((r) => integrationRoute(r, env)),
  );
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(
    (db.prepare("SELECT COUNT(*) n FROM editorial_documents").get() as any).n,
  ).toBe(1);
  expect(
    (await integrationRoute(await request({ ...a, sha: "b".repeat(40) }), env))
      .status,
  ).toBe(200);
  expect(
    (db.prepare("SELECT COUNT(*) n FROM editorial_documents").get() as any).n,
  ).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects unauthenticated, future, invalid, and send/schedule/subscriber operations", async () => {
  const { env, a, request } = setup();
  expect(
    (
      await integrationRoute(
        new Request(
          "https://crm.marioserafim.com.br/integration/v1/newsletter-drafts",
          { method: "POST" },
        ),
        env,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await integrationRoute(
        await request({ ...a, publishAt: "2099-01-01T00:00:00Z" }),
        env,
      )
    ).status,
  ).toBe(400);
  expect(
    (await integrationRoute(await request({ ...a, subscribers: ["x"] }), env))
      .status,
  ).toBe(400);
  for (const path of [
    "/integration/v1/send",
    "/api/campaign-delivery",
    "/api/subscribers",
    "/api/emails",
  ]) {
    const next = vi.fn(() => Promise.resolve(new Response("unsafe")));
    const result = await onRequest({
      env,
      request: await request({}, path),
      next,
    });
    expect([403, 404]).toContain(result.status);
    expect(next).not.toHaveBeenCalled();
  }
  expect(fetch).not.toHaveBeenCalled();
});
