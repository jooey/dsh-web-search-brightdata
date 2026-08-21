/* Host-face Typert manifest for dsh-web-search-brightdata (hand-written).
 * Every codec — parameters AND results — must be strict zod v4: the typert
 * loader rejects src-json codecs anywhere in a contributed manifest. */
import { z } from "zod";

const IndexParam = z.number().int().min(1);
const KeyParam = z.string().min(1);
const ZoneParam = z.string().min(1);

const KeyView = z.object({
	index: z.number().int().min(1),
	masked: z.string(),
	status: z.enum(["active", "cooling", "disabled"]),
	cooldownSecondsLeft: z.number().int().min(0)
});

const ListResult = z.object({
	keys: z.array(KeyView),
	total: z.number().int().min(0),
	active: z.number().int().min(0),
	zone: z.string()
});

const TestItem = z.object({
	index: z.number().int().min(1).optional(),
	masked: z.string(),
	ok: z.boolean(),
	ms: z.number().int().min(0),
	error: z.string().optional()
});

const TestResult = z.object({
	results: z.array(TestItem),
	at: z.string()
});

const strict = (typeSymbol, schema) => ({ mode: "strict", typeSymbol: `dsh-web-search-brightdata/types#${typeSymbol}`, schema });
const param = (name, typeSymbol, schema) => ({ name, wire: name, source: "json", codec: strict(typeSymbol, schema) });

const endpoint = (method, parameters, typeSymbol, schema) => ({
	id: `dsh-web-search-brightdata#brightdataAdmin/${method}`,
	service: "brightdataAdmin",
	namespace: "brightdataAdmin",
	method,
	invocation: { kind: "direct" },
	parameters,
	result: strict(typeSymbol, schema),
	sourceLocation: { file: "lib/index.js", line: 1, column: 1 }
});

export const TYPERT = {
	package: "dsh-web-search-brightdata",
	face: "host",
	schemas: [],
	invocations: [
		endpoint("listKeys", [], "BrightdataAdminList", ListResult),
		endpoint("setZone", [param("zone", "BrightdataZone", ZoneParam)], "BrightdataAdminList", ListResult),
		endpoint("addKey", [param("key", "BrightdataKey", KeyParam)], "BrightdataAdminList", ListResult),
		endpoint("removeKey", [param("index", "BrightdataKeyIndex", IndexParam)], "BrightdataAdminList", ListResult),
		endpoint("toggleKey", [param("index", "BrightdataKeyIndex", IndexParam)], "BrightdataAdminList", ListResult),
		endpoint("testKey", [param("index", "BrightdataKeyIndex", IndexParam)], "BrightdataAdminTestItem", TestItem),
		endpoint("testAll", [], "BrightdataAdminTest", TestResult),
		endpoint("resetCooldowns", [], "BrightdataAdminList", ListResult)
	],
	model: { services: [], events: [], objects: [] }
};

export default TYPERT;
