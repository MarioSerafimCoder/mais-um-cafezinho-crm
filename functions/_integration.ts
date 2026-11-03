import { campaignSlug } from '../src/lib/newsletter-attribution';
import { type AppEnv, json, errorResponse, buttondown } from "./_utils";
import {
  verify,
  articleInput,
  VERSION,
  signature,
} from "../shared/ecosystem-contract";
import { onRequestPut } from "./api/drafts/[id]";
import { getDocument } from "./_documents";
import { getTemplate } from "../src/data/templates";
import { htmlToDocument } from "../src/lib/editor-migration";
import { escapeHtml } from "../shared/urls";
export async function integrationRoute(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  try {
    const raw = await verify(request, env.ECOSYSTEM_SECRET);
    if (new URL(request.url).pathname === "/integration/v1/newsletter-summary" && request.method === "GET") {
      const upstream = await buttondown({request,env}, '/emails?status=sent&ordering=-creation_date&page=1') as {results?: Array<Record<string, unknown>>;count?:number;next?:string|null};
      return json({version:'newsletter-1.0', campaigns:(upstream.results || []).map(c => ({
        id: String(c.id || '').slice(0,100), subject:String(c.subject || '').slice(0,200), campaignSlug:campaignSlug(String(c.subject || '')), sentAt:typeof c.publish_date === 'string' ? c.publish_date : null,
        recipients:typeof c.recipient_count === 'number' ? c.recipient_count : null
      })), limited:!!upstream.next});
    }
    if (
      new URL(request.url).pathname !== "/integration/v1/newsletter-drafts" ||
      request.method !== "POST"
    )
      return json({ error: "not_found" }, 404);
    let a;
    try {
      a = articleInput(JSON.parse(raw));
    } catch {
      return json({ error: "invalid_contract" }, 400);
    }
    // Deterministic ID + existing create-only CAS: retries never overwrite a human edit.
    const id =
      "blog-" +
      (await signature("ecosystem-public-id-v1", `${a.slug}:${a.sha}`));
    const result = () =>
      json({
        version: VERSION,
        id,
        adminUrl: `${env.ENVIRONMENT === "staging" && env.CRM_ORIGIN === "https://crm-ecosystem-staging.pages.dev" ? env.CRM_ORIGIN : "https://crm.marioserafim.com.br"}/editor/${id}`,
        articleSlug: a.slug,
        articleVersion: a.sha,
      });
    try {
      await getDocument(env, "draft", id);
      return result();
    } catch (e) {
      if (!(e instanceof Response && e.status === 404)) throw e;
    }
    const template = getTemplate("blog");
    const signatureHtml = template.content.slice(
      template.content.lastIndexOf("<hr"),
    );
    const content = `<h1>${escapeHtml(a.title)}</h1><p>${escapeHtml(a.category)}</p>${a.cover ? `<p><img src="${escapeHtml(a.cover)}" alt="" /></p>` : ""}<p>${escapeHtml(a.summary)}</p><p><a href="${escapeHtml(a.url)}">Continuar a leitura →</a></p>${signatureHtml}`;
    const payload = {
      id,
      status: "draft",
      subject: a.title,
      description: a.summary.slice(0, 200),
      buttondownTemplate: template.buttondownTemplate,
      templateId: "blog",
      schemaVersion: 3,
      revision: 1,
      cloudRevision: 0,
      updatedAt: new Date().toISOString(),
      content,
      document: htmlToDocument(content),
    };
    const saved = await onRequestPut({
      env,
      params: { id },
      request: new Request(request.url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    });
    if (!saved.ok && saved.status !== 409) return saved;
    await getDocument(env, "draft", id);
    return result();
  } catch (e) {
    return errorResponse(e);
  }
}
