import jsonld from "jsonld";
import { Store, Parser } from "n3";

const CROISSANT_ODRL_CONTEXT = {
  "@vocab": "https://schema.org/",
  sc: "https://schema.org/",
  cr: "http://mlcommons.org/croissant/",
  odrl: "http://www.w3.org/ns/odrl/2/",
  dct: "http://purl.org/dc/terms/",
  distribution: "sc:distribution",
  recordSet: "cr:recordSet",
  hasPolicy: "odrl:hasPolicy",
  "@language": null,
  rightOperand: { "@id": "odrl:rightOperand", "@language": null },
  "odrl:rightOperand": { "@id": "odrl:rightOperand", "@language": null },
};

// function findPolicyRoots(store: Store): import("n3").Quad_Object[] {
//   const schemaOrg = "https://schema.org/";
//   const odrl = "http://www.w3.org/ns/odrl/2/";
//   const roots = [
//     ...store.getQuads(null, `${schemaOrg}usageInfo`, null, null),
//     ...store.getQuads(null, `${odrl}hasPolicy`, null, null),
//   ];
//   return roots.map((q) => q.object);
// }

function findPolicyRoots(store: Store): import("n3").Quad_Object[] {
  const schemaOrgHttps = "https://schema.org/";
  const schemaOrgHttp = "http://schema.org/";
  const odrl = "http://www.w3.org/ns/odrl/2/";
  const roots = [
    ...store.getQuads(null, `${schemaOrgHttps}usageInfo`, null, null),
    ...store.getQuads(null, `${schemaOrgHttp}usageInfo`, null, null),
    ...store.getQuads(null, `${odrl}hasPolicy`, null, null),
  ];
  return roots.map((q) => q.object);
}

// export async function extractPolicyQuads(croissantDoc: unknown, baseIri: string): Promise<import("n3").Quad[]> {
//   const merged = {
//     ...(croissantDoc as object),
//     "@context": [(croissantDoc as any)["@context"] ?? {}, CROISSANT_ODRL_CONTEXT],
//   };

export async function extractPolicyQuads(croissantDoc: unknown, baseIri: string): Promise<import("n3").Quad[]> {
  const rawContext = (croissantDoc as any)["@context"];
  const contextArray = Array.isArray(rawContext) ? rawContext : [rawContext ?? {}];
  const merged = {
    ...(croissantDoc as object),
    "@context": [...contextArray, CROISSANT_ODRL_CONTEXT],
  };

  const nquads = (await jsonld.toRDF(merged, {
    format: "application/n-quads",
    base: baseIri,
  })) as unknown as string;

  const allQuads = new Parser({ format: "N-Quads" }).parse(nquads);
  const store = new Store(allQuads);

  const visited = new Set<string>();
  const result: import("n3").Quad[] = [];
  const frontier = findPolicyRoots(store);

  while (frontier.length) {
    const node = frontier.pop()!;
    const key = node.value;
    if (visited.has(key)) continue;
    visited.add(key);

    const quads = store.getQuads(node, null, null, null);
    for (const q of quads) {
      result.push(q);
      if (q.object.termType === "NamedNode" || q.object.termType === "BlankNode") {
        frontier.push(q.object);
      }
    }
  }

  return result;
}

export async function fetchCroissant(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Croissant file: ${res.status} ${res.statusText}`);
  return res.json();
}
