window.__ModuleLoader__.load({
	id: "dsh-web-search-brightdata",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;
		const { useState, useEffect } = React;

		/* Client-face Typert remote manifest (mirrors lib/typert.host.js).
		 * Every codec — parameters AND results — strict with defensive parse(). */
		const int = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
		const str = (v, fallback) => (typeof v === "string" ? v : fallback);
		const parseKeyView = (k) => ({
			index: int(k?.index) || 1,
			masked: str(k?.masked, "?"),
			status: k?.status === "cooling" ? "cooling" : k?.status === "disabled" ? "disabled" : "active",
			cooldownSecondsLeft: int(k?.cooldownSecondsLeft)
		});
		const parseList = (value) => {
			if (!value || typeof value !== "object" || !Array.isArray(value.keys)) throw new TypeError("expected a brightdata key list object");
			return { keys: value.keys.map(parseKeyView), total: int(value.total), active: int(value.active), zone: str(value.zone, "") };
		};
		const parseTestItem = (value) => {
			if (!value || typeof value !== "object") throw new TypeError("expected a brightdata test item");
			return {
				index: typeof value.index === "number" ? int(value.index) : undefined,
				masked: str(value.masked, "?"),
				ok: value.ok === true,
				ms: int(value.ms),
				error: typeof value.error === "string" ? value.error : undefined
			};
		};
		const parseTest = (value) => {
			if (!value || typeof value !== "object" || !Array.isArray(value.results)) throw new TypeError("expected a brightdata test result object");
			return { results: value.results.map(parseTestItem), at: str(value.at, "") };
		};
		const parseIdx = (v) => { const n = int(v); if (n < 1) throw new TypeError("index must be a positive integer"); return n; };
		const parseKey = (v) => { const s = str(v, "").trim(); if (s === "") throw new TypeError("key must be a non-empty string"); return s; };
		const parseZone = (v) => { const s = str(v, "").trim(); if (s === "") throw new TypeError("zone must be a non-empty string"); return s; };
		const strict = (typeSymbol, parse) => ({ mode: "strict", typeSymbol: `dsh-web-search-brightdata/types#${typeSymbol}`, schema: { parse }, create: () => ({ parse }) });
		const param = (name, typeSymbol, parse) => ({ name, wire: name, source: "json", codec: strict(typeSymbol, parse) });
		const endpoint = (method, parameters, typeSymbol, parse) => ({
			id: `dsh-web-search-brightdata#brightdataAdmin/${method}`,
			service: "brightdataAdmin",
			namespace: "brightdataAdmin",
			method,
			invocation: { kind: "direct" },
			parameters,
			result: strict(typeSymbol, parse),
			sourceLocation: { file: "lib/index.js", line: 1, column: 1 }
		});
		const TYPERT_REMOTE = {
			package: "dsh-web-search-brightdata",
			descriptors: [
				endpoint("listKeys", [], "BrightdataAdminList", parseList),
				endpoint("setZone", [param("zone", "BrightdataZone", parseZone)], "BrightdataAdminList", parseList),
				endpoint("addKey", [param("key", "BrightdataKey", parseKey)], "BrightdataAdminList", parseList),
				endpoint("removeKey", [param("index", "BrightdataKeyIndex", parseIdx)], "BrightdataAdminList", parseList),
				endpoint("toggleKey", [param("index", "BrightdataKeyIndex", parseIdx)], "BrightdataAdminList", parseList),
				endpoint("testKey", [param("index", "BrightdataKeyIndex", parseIdx)], "BrightdataAdminTestItem", parseTestItem),
				endpoint("testAll", [], "BrightdataAdminTest", parseTest),
				endpoint("resetCooldowns", [], "BrightdataAdminList", parseList)
			]
		};

		const CSS = `
.bdk_section{flex-direction:column;gap:14px;width:100%;max-width:760px;display:flex}
.bdk_group{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:16px;flex-direction:column;flex:none;gap:8px;padding:18px 20px 20px;display:flex}
.bdk_heading{color:var(--dsw-alias-label-primary);align-items:baseline;gap:7px;padding:0 2px 6px;font-size:13px;font-weight:600;line-height:20px;display:flex}
.bdk_count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:18px}
.bdk_row{justify-content:space-between;align-items:center;gap:16px;padding:12px 2px;display:flex}
.bdk_rowWrap{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:4px;padding:10px 2px;display:flex}
.bdk_rowWrap:last-child{border-bottom:none}
.bdk_rowMain{align-items:center;gap:10px;min-width:0;display:flex}
.bdk_rowIdx{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;flex:none;width:22px}
.bdk_key{font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bdk_dot{border-radius:50%;width:7px;height:7px;flex:none}
.bdk_dotActive{background:var(--dsw-alias-state-success-primary)}
.bdk_dotCooling{background:var(--dsw-alias-state-warn-primary)}
.bdk_dotDisabled{background:var(--dsw-alias-label-dimmed)}
.bdk_status{align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;flex:none;display:flex}
.bdk_actions{align-items:center;gap:6px;flex:none;display:flex}
.bdk_btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:8px;flex:none;padding:3px 12px;font-size:12px;line-height:1.5}
.bdk_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}
.bdk_btn:disabled{opacity:.45;cursor:default}
.bdk_btnDanger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.bdk_btnPrimary{appearance:none;font:inherit;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border:1px solid transparent;border-radius:8px;flex:none;padding:5px 14px;font-size:13px;line-height:1.5}
.bdk_btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.bdk_btnPrimary:disabled{opacity:.45;cursor:default}
.bdk_rowResult{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px;padding:0 2px 0 32px}
.bdk_rowResultOk{color:var(--dsw-alias-state-success-primary)}
.bdk_rowResultErr{color:var(--dsw-alias-state-error-primary);word-break:break-all}
.bdk_empty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:8px 2px}
.bdk_error{color:var(--dsw-alias-state-error-primary);padding:2px 2px;font-size:12px;line-height:17px;word-break:break-all}
.bdk_addRow{align-items:center;gap:8px;display:flex}
.bdk_input{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-size:12px;border-radius:6px;flex:1;padding:0 10px;box-sizing:border-box}
.bdk_input:focus{border-color:var(--dsw-alias-border-l2);outline:none}
.bdk_zoneRow{align-items:center;gap:8px;padding:2px 2px 8px;display:flex}
.bdk_zoneLabel{color:var(--dsw-alias-label-secondary);flex:none;font-size:12px}
.bdk_zoneInput{max-width:220px}
.bdk_hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;padding:0 2px}
.bdk_footer{align-items:center;justify-content:space-between;gap:8px;padding-top:4px;display:flex}
.bdk_muted{color:var(--dsw-alias-label-tertiary);font-size:12px}
		`;

		const fmtCooldown = (seconds) => {
			if (seconds >= 60) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
			return `${seconds}s`;
		};

		function BrightdataKeysSection(props) {
			const admin = props.admin;
			const snapState = useState(null);
			const setSnap = snapState[1];
			const busyState = useState("");
			const setBusy = busyState[1];
			const oneState = useState({});
			const setOne = oneState[1];
			const addTextState = useState("");
			const setAddText = addTextState[1];
			const zoneTextState = useState("");
			const setZoneText = zoneTextState[1];
			const errState = useState("");
			const setErr = errState[1];

			/* Remote methods resolve to a carrier {ok, value} | {ok: false, error}
			 * and never throw — unwrap explicitly at every call site. The failure
			 * side is a structured {code, message, details} object, not a string. */
			const messageOf = (error) => {
				if (error === null || error === undefined) return "RPC 调用失败";
				if (typeof error === "string") return error;
				if (typeof error.message === "string" && error.message !== "") return error.message;
				try { return JSON.stringify(error); } catch { return String(error); }
			};
			const call = async (promise) => {
				const carrier = await promise;
				if (carrier === null || typeof carrier !== "object" || carrier.ok !== true) {
					throw new Error(messageOf(carrier?.error));
				}
				return carrier.value;
			};

			useEffect(() => {
				let alive = true;
				call(admin.listKeys()).then((value) => { if (alive) { setSnap(value); setZoneText(value.zone); } }).catch((error) => { if (alive) setErr(String(error?.message ?? error)); });
				return () => { alive = false; };
			}, []);

			const withBusy = async (tag, fn) => {
				setBusy(tag); setErr("");
				try { return await fn(); }
				catch (error) { setErr(String(error?.message ?? error)); return undefined; }
				finally { setBusy(""); }
			};

			const testOne = (index) => withBusy(`one-${index}`, async () => {
				const item = await call(admin.testKey(index));
				setOne((prev) => ({ ...prev, [index]: item }));
			});

			const toggle = (index) => withBusy(`tog-${index}`, async () => setSnap(await call(admin.toggleKey(index))));
			const remove = (index) => withBusy(`del-${index}`, async () => setSnap(await call(admin.removeKey(index))));
			const testAll = () => withBusy("test", async () => {
				const value = await call(admin.testAll());
				const map = {};
				for (const item of value.results) if (item.index !== undefined) map[item.index] = item;
				setOne((prev) => ({ ...prev, ...map }));
			});
			const resetCooldowns = () => withBusy("reset", async () => setSnap(await call(admin.resetCooldowns())));

			const add = () => {
				const key = addTextState[0].trim();
				if (key === "") { setErr("请粘贴一把 key"); return; }
				return withBusy("add", async () => {
					setSnap(await call(admin.addKey(key)));
					setAddText("");
				});
			};

			const saveZone = () => {
				const zone = zoneTextState[0].trim();
				if (zone === "") { setErr("zone 不能为空"); return; }
				return withBusy("zone", async () => setSnap(await call(admin.setZone(zone))));
			};

			const snap = snapState[0];
			const rows = snap !== null && Array.isArray(snap.keys) ? snap.keys : [];

			const statusOf = (row) => {
				if (row.status === "disabled") return { dot: "bdk_dotDisabled", label: "已停用" };
				if (row.status === "cooling") return { dot: "bdk_dotCooling", label: `冷却 ${fmtCooldown(row.cooldownSecondsLeft)}` };
				return { dot: "bdk_dotActive", label: "活跃" };
			};

			return h("div", { className: "bdk_section" },
				h("div", { className: "bdk_group" },
					h("div", { className: "bdk_heading" }, "Bright Data SERP Key 池",
						snap !== null ? h("span", { className: "bdk_count" }, `共 ${snap.total} 把 · 活跃 ${snap.active} 把`) : null
					),
					h("div", { className: "bdk_zoneRow" },
						h("span", { className: "bdk_zoneLabel" }, "SERP zone"),
						h("input", {
							className: "bdk_input bdk_zoneInput",
							value: zoneTextState[0],
							placeholder: "serp_api_dsh",
							onChange: (e) => setZoneText(e.target.value),
							onKeyDown: (e) => { if (e.key === "Enter") saveZone(); }
						}),
						h("button", { className: "bdk_btn", disabled: busyState[0] !== "" || snap === null || zoneTextState[0].trim() === snap.zone, onClick: saveZone }, busyState[0] === "zone" ? "…" : "保存 zone")
					),
					errState[0] !== "" ? h("div", { className: "bdk_error" }, errState[0]) : null,
					rows.length === 0 && snap !== null ? h("div", { className: "bdk_empty" }, "池为空 — 在下方添加第一把 key（Bright Data 控制台的 API token）") : null,
					rows.map((row) => {
						const st = statusOf(row);
						const result = oneState[0][row.index];
						return h("div", { key: row.index, className: "bdk_rowWrap" },
							h("div", { className: "bdk_row" },
								h("div", { className: "bdk_rowMain" },
									h("span", { className: "bdk_rowIdx" }, `#${row.index}`),
									h("span", { className: `bdk_dot ${st.dot}` }),
									h("code", { className: "bdk_key" }, row.masked),
									h("span", { className: "bdk_status" }, st.label)
								),
								h("div", { className: "bdk_actions" },
									h("button", { className: "bdk_btn", disabled: busyState[0] !== "", onClick: () => testOne(row.index) }, busyState[0] === `one-${row.index}` ? "…" : "测试"),
									h("button", { className: "bdk_btn", disabled: busyState[0] !== "", onClick: () => toggle(row.index) }, row.status === "disabled" ? "启用" : "停用"),
									h("button", { className: "bdk_btn bdk_btnDanger", disabled: busyState[0] !== "", onClick: () => remove(row.index) }, "删除")
								)
							),
							result !== undefined ? h("div", { className: `bdk_rowResult ${result.ok ? "bdk_rowResultOk" : "bdk_rowResultErr"}` },
								result.ok ? `✓ ${result.ms}ms` : `✗ ${result.error ?? "失败"}`
							) : null
						);
					}),
					rows.length > 0 ? h("div", { className: "bdk_footer" },
						h("span", { className: "bdk_muted" }, "每次搜索消耗 zone 请求数 · 所有操作即时生效"),
						h("div", { className: "bdk_actions" },
							h("button", { className: "bdk_btn", disabled: busyState[0] !== "", onClick: testAll }, busyState[0] === "test" ? "测试中…" : "全部测试"),
							h("button", { className: "bdk_btn", disabled: busyState[0] !== "", onClick: resetCooldowns }, "重置冷却")
						)
					) : null
				),
				h("div", { className: "bdk_group" },
					h("div", { className: "bdk_heading" }, "新增 Key"),
					h("div", { className: "bdk_addRow" },
						h("input", {
							className: "bdk_input",
							value: addTextState[0],
							placeholder: "Bright Data API token (UUID)",
							onChange: (e) => setAddText(e.target.value),
							onKeyDown: (e) => { if (e.key === "Enter") add(); }
						}),
						h("button", { className: "bdk_btnPrimary", disabled: busyState[0] !== "" || addTextState[0].trim() === "", onClick: add }, busyState[0] === "add" ? "添加中…" : "添加")
					),
					h("div", { className: "bdk_hint" }, "Bright Data 控制台 → Account settings → API tokens；免费注册送额度，多账号可加多把轮换")
				)
			);
		}

		async function apply(ctx) {
			await ctx.remote.$mount(TYPERT_REMOTE);
			const admin = ctx.get("remote.brightdataAdmin");
			const style = document.createElement("style");
			style.textContent = CSS;
			document.head.appendChild(style);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "web-search-brightdata",
				order: 12,
				label: "Bright Data SERP",
				inject: () => ({ admin })
			}, BrightdataKeysSection));
		}

		const inject = ["slots", "remote"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
