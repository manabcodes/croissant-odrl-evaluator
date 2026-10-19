import { Parser, type Quad } from "n3";

export interface UsageRequest {
  assignee: string;
  action: string;
  target: string;
  purpose?: string;
  baseIri: string;
}

const PREFIXES = `
@prefix odrl: <http://www.w3.org/ns/odrl/2/>.
@prefix dct: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix ex: <http://example.org/>.
@prefix temp: <http://example.com/request/>.
@prefix sotw: <https://w3id.org/force/sotw#>.
`;

function iri(value: string, base: string): string {
  if (value.startsWith("http")) return `<${value}>`;
  return `<${new URL(value, base).toString()}>`;
}

export async function buildRequestQuads(req: UsageRequest): Promise<Quad[]> {
  const target = iri(req.target, req.baseIri);
  const assignee = iri(req.assignee, req.baseIri);
  const purposeContext = req.purpose
    ? `sotw:context [ a odrl:Constraint ; odrl:leftOperand odrl:purpose ; odrl:operator odrl:eq ; odrl:rightOperand "${req.purpose}" ] ;`
    : "";

  const turtle = `
    ${PREFIXES}
    temp:request a odrl:Request ;
      dct:description "Programmatic usage request" ;
      odrl:permission temp:requestedPermission .
    temp:requestedPermission a odrl:Permission ;
      odrl:assignee ${assignee} ;
      odrl:action odrl:${req.action} ;
      ${purposeContext}
      odrl:target ${target} .
  `;

  return new Parser({ format: "Turtle" }).parse(turtle);
}

export interface WorldState {
  now?: Date;
  parties?: string[];
  baseIri: string;
}

export async function buildStateOfTheWorldQuads(sotw: WorldState): Promise<Quad[]> {
  const now = (sotw.now ?? new Date()).toISOString();
  const partyTriples = (sotw.parties ?? [])
    .map((p) => `${iri(p, sotw.baseIri)} a foaf:Person .`)
    .join("\n");
  const partyList = (sotw.parties ?? []).map((p) => iri(p, sotw.baseIri)).join(", ");

  const turtle = `
    ${PREFIXES}
    temp:sotw a ex:Sotw ;
      ex:includes temp:currentTime ${partyList ? `, ${partyList}` : ""} .
    temp:currentTime dct:issued "${now}"^^xsd:dateTime .
    ${partyTriples}
  `;

  return new Parser({ format: "Turtle" }).parse(turtle);
}
