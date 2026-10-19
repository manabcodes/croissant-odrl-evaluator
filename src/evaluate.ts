import { ODRLEvaluator, ODRLEngineMultipleSteps, prefixes } from "odrl-evaluator";
import { Store, type Quad } from "n3";
import type * as RDF from "@rdfjs/types";
import { write } from "@jeswr/pretty-turtle";
import { extractPolicyQuads, fetchCroissant } from "./croissant.js";
import { buildRequestQuads, buildStateOfTheWorldQuads, type UsageRequest, type WorldState } from "./request.js";

const REPORT = "https://w3id.org/force/compliance-report#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

export type Decision = "permit" | "deny" | "undetermined";

export interface EvaluationResult {
  decision: Decision;
  permissionsSatisfied: number;
  permissionsTotal: number;
  prohibitionsViolated: number;
  reportTurtle: string;
}

export async function evaluateCroissantPolicy(
  croissantUrlOrDoc: string | unknown,
  request: Omit<UsageRequest, "baseIri">,
  world: Omit<WorldState, "baseIri"> = {},
): Promise<EvaluationResult> {
  const isUrl = typeof croissantUrlOrDoc === "string";
  const croissantDoc = isUrl ? await fetchCroissant(croissantUrlOrDoc as string) : croissantUrlOrDoc;
  const baseIri = isUrl ? (croissantUrlOrDoc as string) : ((croissantDoc as any)?.url ?? "http://localhost/");

  const policyQuads = await extractPolicyQuads(croissantDoc, baseIri);
  if (policyQuads.length === 0) {
    throw new Error("No odrl:hasPolicy found in this Croissant file");
  }

  const requestQuads = await buildRequestQuads({ ...request, baseIri });
  const sotwQuads = await buildStateOfTheWorldQuads({
    ...world,
    parties: [...(world.parties ?? []), request.assignee],
    baseIri,
  });

  const evaluator = new ODRLEvaluator(new ODRLEngineMultipleSteps());
  const reportQuads = await evaluator.evaluate(policyQuads, requestQuads, sotwQuads);

  return summarizeReport(reportQuads);
}

async function summarizeReport(reportQuads: readonly RDF.Quad[]): Promise<EvaluationResult> {
  const quads = reportQuads as Quad[];
  const store = new Store(quads);

  const permissionReports = store.getQuads(null, RDF_TYPE, `${REPORT}PermissionReport`, null);
  const prohibitionReports = store.getQuads(null, RDF_TYPE, `${REPORT}ProhibitionReport`, null);

  const isActive = (subject: Quad["subject"]): boolean =>
    store.getQuads(subject, `${REPORT}activationState`, `${REPORT}Active`, null).length > 0;

  const activePermissions = permissionReports.filter((q) => isActive(q.subject)).length;
  const activeProhibitions = prohibitionReports.filter((q) => isActive(q.subject)).length;

  let decision: Decision = "undetermined";
  if (activeProhibitions > 0) decision = "deny";
  else if (activePermissions > 0) decision = "permit";

  return {
    decision,
    permissionsSatisfied: activePermissions,
    permissionsTotal: permissionReports.length,
    prohibitionsViolated: activeProhibitions,
    reportTurtle: await write(quads, { prefixes }),
  };
}
