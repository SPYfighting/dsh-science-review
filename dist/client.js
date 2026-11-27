window.__ModuleLoader__.load({ id: "dsh-science-review", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// client/Settings.jsx
var import_react2 = require("react");

// lib/presets.js
var checkLabels = {
  numbers: "\u6570\u5B57\u4E0E\u5355\u4F4D",
  execution: "\u6267\u884C\u8BB0\u5F55",
  figures: "\u56FE\u8868\u4E0E\u6570\u636E",
  citations: "\u5F15\u6587\u4E0E\u6587\u732E\u6807\u8BC6",
  plan: "\u8BA1\u5212\u5B8C\u6210\u60C5\u51B5",
  methods: "\u65B9\u6CD5\u4E0E\u7ED3\u8BBA",
  code: "\u4EE3\u7801\u5173\u952E\u8282\u70B9",
  writing: "\u4EA4\u4ED8\u6587\u672C\u4E2D\u7684 AI \u75D5\u8FF9",
  scope: "\u4EFB\u52A1\u8303\u56F4\u4E0E\u6388\u6743"
};
var checkPresets = {
  efficient: ["numbers", "execution", "methods"],
  full: Object.keys(checkLabels)
};
function identifyCheckPreset(checks) {
  for (const [id, preset] of Object.entries(checkPresets)) {
    if (checks.length === preset.length && preset.every((check) => checks.includes(check))) return id;
  }
  return "custom";
}

// client/api.js
async function request(route, { query, body, signal } = {}) {
  const url = new URL("/plugins/dsh-review/" + route, window.location.origin);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  const response = await fetch(url, {
    method: body === void 0 ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...body === void 0 ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || `\u5BA1\u67E5\u670D\u52A1\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
    error.status = response.status;
    throw error;
  }
  return data;
}
var modes = { manual: "\u4EC5\u624B\u52A8", key: "\u5173\u952E\u8F6E\u6B21", every: "\u6BCF\u4E00\u8F6E" };
var handlingLabels = { manual: "\u624B\u52A8\u542F\u52A8", conditional: "\u5206\u60C5\u51B5\u5904\u7406", auto: "\u81EA\u52A8\u6838\u5B9E\u4E0E\u4FEE\u6B63" };
var handlingHelp = {
  manual: "\u70B9\u51FB\u62A5\u544A\u4E2D\u7684\u6309\u94AE\u542F\u52A8\u4E3B\u52A9\u624B\u3002",
  conditional: "\u8BC1\u636E\u80FD\u786E\u5B9A\u6539\u6CD5\u65F6\u81EA\u52A8\u4FEE\u6B63\u5E76\u590D\u5BA1\uFF0C\u5176\u4F59\u4E8B\u9879\u7531\u4F60\u9009\u62E9\u3002",
  auto: "\u4E3B\u52A9\u624B\u53EF\u5148\u7528\u5DF2\u6709\u8BC1\u636E\u6838\u5B9E\u7591\u70B9\uFF0C\u518D\u4FEE\u6B63\u5E76\u590D\u5BA1\u3002\u9700\u8981\u8865\u5145\u6750\u6599\u65F6\u4F1A\u7B49\u4F60\u5904\u7406\u3002"
};
var modeHelp = {
  manual: "\u7531\u4F60\u5728\u4F1A\u8BDD\u4E2D\u9009\u62E9\u9700\u8981\u6838\u5BF9\u7684\u56DE\u7B54\u3002",
  key: "\u9047\u5230\u4EA4\u4ED8\u7269\u3001\u91CD\u8981\u7ED3\u8BBA\u6216\u51B3\u5B9A\u3001\u5B9E\u9645\u53D8\u66F4\u53CA\u9A8C\u8BC1\u7ED3\u679C\u65F6\u5BA1\u67E5\u3002\u666E\u901A\u95EE\u5019\u548C\u5355\u7EAF\u67E5\u9605\u901A\u5E38\u4F1A\u8DF3\u8FC7\u3002",
  every: "\u6BCF\u6B21\u7528\u6237\u63D0\u95EE\u5F97\u5230\u5B8C\u6574\u56DE\u7B54\u540E\u90FD\u5BA1\u67E5\u3002"
};

// client/report.js
var levels = ["error", "warning", "note"];
var categories = { error: "\u5B9E\u8D28\u95EE\u9898", warning: "\u5F85\u6838\u5B9E", note: "\u63D0\u793A" };
function visibleMode(data, error) {
  const mode = data?.effectiveMode;
  return !error && ["manual", "key", "every"].includes(mode) ? mode : "unknown";
}
function orderedFindings(findings = []) {
  const rank = (finding) => {
    const index = levels.indexOf(finding.severity);
    return index < 0 ? levels.length : index;
  };
  return findings.slice().sort((a, b) => rank(a) - rank(b));
}
function reviewLabel(review) {
  if (review.status === "running") return "\u5BA1\u67E5\u4E2D";
  if (review.status === "error") return "\u5BA1\u67E5\u672A\u5B8C\u6210";
  const result = review.result;
  if (!Array.isArray(result?.findings)) return "\u5BA1\u67E5\u62A5\u544A";
  if (result.schemaVersion >= 2) {
    const labels = result.partial ? ["\u90E8\u5206\u5B8C\u6210"] : [];
    const counted = /* @__PURE__ */ new Set();
    let errors = 0, warnings = 0, notes = 0, gaps = 0;
    for (const f of orderedFindings(result.findings)) {
      const key = f.claim && JSON.stringify([f.claimSource || f.claimLocation, f.claim]);
      if (key && counted.has(key)) continue;
      if (key) counted.add(key);
      if (f.severity === "error") errors++;
      else if (f.severity === "warning") warnings++;
      else notes++;
    }
    for (const gap of result.gaps || []) {
      const key = JSON.stringify([gap.claimSource, gap.claim]);
      if (!counted.has(key)) {
        counted.add(key);
        gaps++;
      }
    }
    if (errors) labels.push(`${errors} \u9879\u5B9E\u8D28\u95EE\u9898`);
    if (warnings) labels.push(`${warnings} \u9879\u98CE\u9669\u5F85\u6838\u5B9E`);
    if (gaps) labels.push(`${gaps} \u9879\u5173\u952E\u4E8B\u5B9E\u5F85\u6838\u5B9E`);
    if (notes) labels.push(`${notes} \u9879\u63D0\u793A`);
    if (result.method === "local" && result.localLabel && !labels.length) return result.localLabel;
    return labels.join(" \xB7 ") || "\u5DF2\u5BA1\u67E5 \xB7 \u672A\u53D1\u73B0\u5177\u4F53\u95EE\u9898";
  }
  const counts = levels.map((level) => {
    const count = result.findings.filter((f) => f.severity === level).length;
    return count ? categories[level] + " " + count : null;
  }).filter(Boolean);
  if (!counts.length && result.findings.length) counts.push("\u5BA1\u67E5\u53D1\u73B0 " + result.findings.length);
  if (result.limitations?.length) counts.push("\u6709\u6838\u67E5\u9650\u5236");
  return counts.length ? counts.join(" \xB7 ") : "\u5BA1\u67E5\u5B8C\u6210 \xB7 \u672A\u62A5\u544A\u95EE\u9898";
}
function evidenceParts(finding) {
  const { evidence = "", quote } = finding;
  if (typeof quote === "string" && quote && evidence.startsWith("[") && evidence.endsWith("] " + quote)) {
    return { location: evidence.slice(1, -quote.length - 2), quote };
  }
  return { location: "", quote: evidence || quote || "" };
}
function feedbackLabel(feedback) {
  if (!feedback) return "\u6709\u53D1\u73B0\u65F6\uFF0C\u4E3B\u52A9\u624B\u4F1A\u5728\u540E\u7EED\u7528\u6237\u63D0\u95EE\u65F6\u6536\u5230\u5BA1\u67E5\u6458\u5F55\u3002";
  if (feedback.total <= 0) return "";
  if (feedback.sent === 0) return "\u5F85\u4EA4\u7ED9\u4E3B\u52A9\u624B\u3002\u4F60\u4E0B\u6B21\u53D1\u8A00\u65F6\uFF0C\u4F1A\u9644\u4E0A\u5BA1\u67E5\u6458\u5F55\u3002";
  if (feedback.sent >= feedback.total) return "\u5DF2\u5E26\u5165\u4E3B\u52A9\u624B\u4E0A\u4E0B\u6587\u3002\u53EF\u8D77\u8349\u8BF7\u6C42\uFF0C\u8981\u6C42\u4E3B\u52A9\u624B\u9010\u9879\u590D\u6838\u3002";
  return "\u5DF2\u6709 " + feedback.sent + "/" + feedback.total + " \u9879\u5E26\u5165\u4E3B\u52A9\u624B\u4E0A\u4E0B\u6587\uFF0C\u5176\u4F59\u5C06\u5728\u540E\u7EED\u53D1\u8A00\u65F6\u9001\u8FBE\u3002";
}
function usageLabel(usage) {
  if (!Number.isSafeInteger(usage?.requests) || usage.requests < 0) return "";
  const calls = `\u6A21\u578B\u8BF7\u6C42 ${usage.requests} \u6B21`;
  return Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0 ? calls + " \xB7 \u5171 " + usage.totalTokens.toLocaleString("zh-CN") + " tokens" : calls;
}
var usageFields = [
  ["inputTokens", "\u672A\u7F13\u5B58\u8F93\u5165"],
  ["cacheReadTokens", "\u7F13\u5B58\u8BFB\u53D6"],
  ["cacheWriteTokens", "\u7F13\u5B58\u5199\u5165"],
  ["outputTokens", "\u8F93\u51FA"],
  ["reasoningTokens", "\u63A8\u7406"],
  ["totalTokens", "\u603B\u91CF"]
];
function usageDetails(usage) {
  return usageFields.map(([key, label]) => ({
    key,
    label,
    value: Number.isSafeInteger(usage?.[key]) && usage[key] >= 0 ? usage[key].toLocaleString("zh-CN") : "\u672A\u63D0\u4F9B"
  }));
}
var remedyPhases = {
  waiting: "\u7B49\u5F85\u4F1A\u8BDD\u7A7A\u95F2",
  queued: "\u5DF2\u6392\u961F",
  running: "\u4E3B\u52A9\u624B\u5904\u7406\u4E2D",
  verifying: "\u5B9A\u5411\u590D\u5BA1\u4E2D",
  done: "\u672C\u6B21\u5904\u7406\u7ED3\u675F",
  interrupted: "\u5904\u7406\u4E2D\u65AD",
  cancelled: "\u5DF2\u53D6\u6D88"
};
var remedyOutcomes = {
  pending: "\u5F85\u5904\u7406",
  responded: "\u4E3B\u52A9\u624B\u5DF2\u56DE\u5E94",
  verified: "\u4FEE\u6B63\u5DF2\u6838\u9A8C",
  inapplicable: "\u610F\u89C1\u4E0D\u9002\u7528",
  needs_evidence: "\u4ECD\u5F85\u6838\u5B9E"
};
function remedyActive(job) {
  return ["waiting", "queued", "running", "verifying"].includes(job.phase);
}
function retryJobId(jobs, kind, index, action, note) {
  return jobs.findLast((job) => !remedyActive(job) && job.action === action && (job.note || "") === note.trim() && job.steps?.length === 1 && job.steps[0].kind === kind && job.steps[0].index === index)?.id;
}
function standardsHint(instructions, checks = []) {
  if (/(?:\bDOI\b|引文|文献标识)/iu.test(instructions) && !checks.includes("citations")) {
    return "\u5F53\u524D\u6838\u67E5\u9879\u672A\u5305\u542B\u201C\u5F15\u6587\u4E0E\u6587\u732E\u6807\u8BC6\u201D\u3002\u53EF\u5728\u8BBE\u7F6E\u4E2D\u52FE\u9009\u3002";
  }
  return "";
}
function prepareFollowup(ctx, sessionId, turnId) {
  if (!/^\d+$/.test(turnId)) throw new Error("\u672C\u8F6E\u7F16\u53F7\u65E0\u6548\u3002");
  const binding = ctx.sessions.binding(sessionId);
  if (!binding) throw new Error("\u539F\u4F1A\u8BDD\u5DF2\u5173\u95ED\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u540E\u8D77\u8349\u3002");
  const input = ctx.conversation.input;
  const editor = input.for(binding.ctx);
  const first = "\u8BF7\u590D\u6838\u7B2C " + turnId + " \u8F6E\u7684\u5BA1\u67E5\u62A5\u544A\u3002";
  if (!editor.state.getSnapshot().draft.split(/\r?\n/).includes(first)) {
    const result = input.requestDraftInitialization(binding, {
      prompt: first + "\n\u8BF7\u8BF4\u660E\u54EA\u4E9B\u95EE\u9898\u6210\u7ACB\u53CA\u7406\u7531\uFF0C\u5E76\u5728\u7B54\u590D\u4E2D\u66F4\u6B63\u6709\u8BEF\u5185\u5BB9\u3002",
      whenDraftExists: "append"
    });
    if (result !== "applied") throw new Error("\u5F53\u524D\u8F93\u5165\u6846\u6B63\u5728\u63D0\u4EA4\uFF0C\u8BF7\u7A0D\u540E\u518D\u6B21\u8D77\u8349\u3002");
  }
  editor.focus();
}

// client/session.js
var import_react = require("react");
var stores = /* @__PURE__ */ new Map();
function refreshSessions() {
  for (const store of stores.values()) store.refresh();
}
function sessionStore(sessionId) {
  const listeners = /* @__PURE__ */ new Set();
  let state = { data: null, byTurn: /* @__PURE__ */ new Map(), error: "", busy: false };
  let timer, activeRead, readAgain = false;
  let waitForTurn, retries = 0;
  function publish(patch) {
    if (patch.data) patch.byTurn = new Map(patch.data.turns.map((turn) => [turn.id, turn]));
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  }
  function later(delay) {
    clearTimeout(timer);
    if (listeners.size) timer = setTimeout(() => {
      void refresh();
    }, delay);
  }
  async function refresh() {
    if (activeRead) {
      readAgain = true;
      return;
    }
    if (!listeners.size) return;
    clearTimeout(timer);
    const read = new AbortController();
    activeRead = read;
    try {
      const data = await request("session", { query: { sessionId }, signal: read.signal });
      if (!read.signal.aborted) {
        publish({ data, error: "" });
        if (data.turns.some((turn) => turn.review?.status === "running" || turn.review?.remediation?.some(remedyActive))) later(1400);
        else if (waitForTurn && retries > 0 && (!state.byTurn.has(waitForTurn) || data.effectiveMode !== "manual" && !state.byTurn.get(waitForTurn).review)) {
          retries--;
          later(1200);
        }
      }
    } catch (error) {
      if (!read.signal.aborted) publish({ error: error.message });
    } finally {
      if (activeRead === read) {
        activeRead = null;
        if (readAgain) {
          readAgain = false;
          later(0);
        }
      }
    }
  }
  async function mutate(route, body) {
    if (state.busy) return;
    activeRead?.abort();
    activeRead = null;
    readAgain = false;
    clearTimeout(timer);
    publish({ busy: true, error: "" });
    try {
      const res = await request(route, { body: { sessionId, ...body } });
      if (route === "session") publish({ data: res });
      await refresh();
      return true;
    } catch (error) {
      publish({ error: error.message });
      return false;
    } finally {
      publish({ busy: false });
    }
  }
  return {
    snapshot: () => state,
    refresh,
    subscribe(notify) {
      listeners.add(notify);
      if (listeners.size === 1) later(0);
      return () => {
        listeners.delete(notify);
        if (listeners.size === 0) {
          clearTimeout(timer);
          activeRead?.abort();
          activeRead = null;
          queueMicrotask(() => {
            if (!listeners.size && stores.get(sessionId) === this) stores.delete(sessionId);
          });
        }
      };
    },
    onTurn(id) {
      if (!state.data || !state.byTurn.has(id)) {
        waitForTurn = id;
        retries = 2;
        later(250);
      }
    },
    setMode: (mode) => mutate("session", { mode }),
    setOptions: (patch) => mutate("session", patch),
    remedy: (body) => mutate("remedy", body),
    run: (turnId) => mutate("run", { turnId })
  };
}
function useReviewSession(sessionId) {
  const store = (0, import_react.useMemo)(() => {
    if (!stores.has(sessionId)) stores.set(sessionId, sessionStore(sessionId));
    return stores.get(sessionId);
  }, [sessionId]);
  const subscribe = (0, import_react.useMemo)(() => (listener) => store.subscribe(listener), [store]);
  const state = (0, import_react.useSyncExternalStore)(subscribe, store.snapshot);
  return [state, store];
}
function useTurnArrival(store, turnId) {
  (0, import_react.useEffect)(() => {
    store.onTurn(turnId);
  }, [store, turnId]);
}

// client/Settings.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function useResource(route, queryKey = "", query = {}) {
  const [counter, setCounter] = (0, import_react2.useState)(0);
  const [state, setState] = (0, import_react2.useState)(null);
  const identity = route + queryKey + counter;
  (0, import_react2.useEffect)(() => {
    if (!route) return;
    const controller = new AbortController();
    request(route, { query, signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setState({ identity, value });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ identity, error: error.message });
    });
    return () => controller.abort();
  }, [identity]);
  return { ...state?.identity === identity ? state : {}, reload: () => setCounter((n) => n + 1) };
}
function Retry({ text, retry }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsr-error", role: "alert", children: [
    text,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsr-link", onClick: retry, children: "\u91CD\u8BD5" })
  ] });
}
function Settings() {
  const saved = useResource("settings");
  if (saved.error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Retry, { text: saved.error, retry: saved.reload });
  if (!saved.value) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u5BA1\u67E5\u8BBE\u7F6E\u2026" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsForm, { initial: saved.value, reload: saved.reload });
}
function SettingsForm({ initial, reload }) {
  const catalog = useResource("models");
  const [stored, setStored] = (0, import_react2.useState)(initial);
  const [draft, setDraft] = (0, import_react2.useState)(initial.settings);
  const [state, setState] = (0, import_react2.useState)({ phase: "idle" });
  const following = draft.model === "session";
  const efforts = useResource(following ? "" : "efforts", draft.model, { model: draft.model });
  const models = catalog.value?.models || [];
  const levels2 = efforts.value?.efforts || [];
  const preset = identifyCheckPreset(draft.checks);
  const isDirty = Object.keys(draft).some((key) => key === "checks" ? draft.checks.length !== stored.settings.checks.length || draft.checks.some((check) => !stored.settings.checks.includes(check)) : draft[key] !== stored.settings[key]);
  const change = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setState({ phase: "idle" });
  };
  async function save(event) {
    event.preventDefault();
    if (state.phase === "saving" || !draft.checks.length) return;
    setState({ phase: "saving" });
    try {
      const next = await request("settings", { body: { settings: draft, revision: stored.revision } });
      setStored(next);
      setDraft(next.settings);
      setState({ phase: "saved" });
      refreshSessions();
    } catch (error) {
      setState({ phase: "error", message: error.message, conflict: error.status === 409 });
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: "dsr dsr-settings", onSubmit: save, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u56DE\u7B54\u5BA1\u67E5" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5BA1\u67E5\u53D1\u73B0\u4E0E\u8BC1\u636E\u4F1A\u5217\u5728\u5BF9\u5E94\u56DE\u7B54\u4E0B\u65B9\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "dsr-fields", disabled: state.phase === "saving", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsr-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "\u5BA1\u67E5\u6A21\u578B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: draft.model, onChange: (e) => change({ model: e.target.value, effort: "inherit" }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "session", children: "\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B" }),
            draft.model !== "session" && !models.some((m) => m.value === draft.model) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: draft.model, children: [
              draft.model,
              "\uFF08\u5DF2\u4FDD\u5B58\uFF09"
            ] }),
            models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: model.value, children: [
              model.name,
              " \xB7 ",
              model.provider
            ] }, model.value))
          ] })
        ] }),
        catalog.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Retry, { text: catalog.error, retry: catalog.reload }) : !catalog.value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: "\u6B63\u5728\u8BFB\u53D6 DSH \u6A21\u578B\u76EE\u5F55\u2026" }) : !models.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: "\u6A21\u578B\u76EE\u5F55\u4E3A\u7A7A\u3002\u53EF\u5148\u5728 DSH \u7684\u6A21\u578B\u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u6A21\u578B\u3002" }),
        catalog.value?.errors?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Retry, { text: `\u672A\u80FD\u8BFB\u53D6\u8FD9\u4E9B\u63D0\u4F9B\u65B9\u7684\u6A21\u578B\uFF1A${catalog.value.errors.join("\u3001")}`, retry: catalog.reload }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            "\u63A8\u7406\u5F3A\u5EA6 ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Effort" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: draft.effort, disabled: following || !levels2.length, onChange: (e) => change({ effort: e.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "inherit", children: following ? "\u8DDF\u968F\u4F1A\u8BDD" : "\u4F7F\u7528\u9ED8\u8BA4\u5F3A\u5EA6" }),
            draft.effort !== "inherit" && !levels2.some((o) => o.id === draft.effort) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: draft.effort, children: [
              draft.effort,
              "\uFF08\u5DF2\u4FDD\u5B58\uFF09"
            ] }),
            levels2.map((level) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: level.id, children: level.name || level.id }, level.id))
          ] })
        ] }),
        !following && (efforts.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Retry, { text: efforts.error, retry: efforts.reload }) : !efforts.value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: "\u6B63\u5728\u8BFB\u53D6\u53EF\u7528\u5F3A\u5EA6\u2026" }) : !levels2.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: "\u6B64\u6A21\u578B\u672A\u63D0\u4F9B\u53EF\u9009\u63A8\u7406\u5F3A\u5EA6\u3002" }))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsr-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "\u9ED8\u8BA4\u5BA1\u67E5\u65B9\u5F0F" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u89E6\u53D1\u65F6\u673A" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: draft.mode, onChange: (e) => change({ mode: e.target.value }), children: Object.entries(modes).map(([id, text]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: text }, id)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: modeHelp[draft.mode] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u53D1\u73B0\u95EE\u9898\u540E" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: draft.handling, onChange: (e) => change({ handling: e.target.value }), children: Object.entries(handlingLabels).map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: label }, id)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: handlingHelp[draft.handling] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5355\u8F6E\u8986\u76D6\u5EA6" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: draft.coverage, onChange: (e) => change({ coverage: e.target.value }), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "key", children: "\u5173\u952E\u4E3B\u5F20" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: "\u5168\u90E8\u53EF\u6838\u67E5\u4E3B\u5F20" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-hint", children: draft.coverage === "all" ? "\u9010\u6BB5\u68C0\u67E5\u53EF\u4E0E\u8981\u6C42\u6216\u8BB0\u5F55\u5BF9\u7167\u7684\u9648\u8FF0\u3001\u51B3\u5B9A\u3001\u64CD\u4F5C\u53CA\u4EA4\u4ED8\u5185\u5BB9\u3002" : "\u4F18\u5148\u6838\u5BF9\u4E00\u65E6\u51FA\u9519\u5C31\u4F1A\u6539\u53D8\u7ED3\u8BBA\u3001\u4E0B\u4E00\u6B65\u884C\u52A8\u3001\u4EA4\u4ED8\u53EF\u7528\u6027\u6216\u6388\u6743\u8303\u56F4\u7684\u5185\u5BB9\uFF0C\u5982\u5B9E\u9A8C\u6837\u672C\u91CF\u3001\u9884\u7EA6\u65E5\u671F\u3001\u5199\u5165\u5931\u8D25\u7684\u5904\u7406\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { className: "dsr-group dsr-checks", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: "\u6838\u67E5\u5185\u5BB9" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsr-presets", role: "group", "aria-label": "\u6838\u67E5\u9884\u8BBE", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u9884\u8BBE" }),
          Object.entries({ efficient: "\u9AD8\u6548", full: "\u5168\u9762" }).map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dsr-secondary",
              "aria-pressed": preset === id,
              onClick: () => change({ checks: checkPresets[id] }),
              children: label
            },
            id
          )),
          preset === "custom" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { role: "status", children: "\u81EA\u5B9A\u4E49" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsr-check-list", children: Object.entries(checkLabels).map(([id, text]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: draft.checks.includes(id), onChange: (e) => change({
            checks: e.target.checked ? [...draft.checks, id] : draft.checks.filter((check) => check !== id)
          }) }),
          text
        ] }, id)) }),
        !draft.checks.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsr-error", role: "alert", children: "\u8BF7\u81F3\u5C11\u4FDD\u7559\u4E00\u9879\u6838\u67E5\u5185\u5BB9\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsr-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u9ED8\u8BA4\u8865\u5145\u5BA1\u67E5\u6807\u51C6 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "\u53EF\u9009" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { rows: 3, maxLength: 2e3, value: draft.instructions, placeholder: "\u4F8B\u5982\uFF0C\u6838\u5BF9\u6837\u672C\u91CF\u662F\u5426\u4E0E\u5206\u7EC4\u7EDF\u8BA1\u4E00\u81F4\u3002", onChange: (e) => change({ instructions: e.target.value }) }),
        standardsHint(draft.instructions, draft.checks) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: standardsHint(draft.instructions, draft.checks) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsr-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "submit", className: "dsr-primary", disabled: !isDirty || !draft.checks.length || state.phase === "saving", children: state.phase === "saving" ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E" }),
      state.phase === "saved" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", children: "\u5DF2\u4FDD\u5B58" }),
      state.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { role: "alert", className: "dsr-error", children: [
        state.message,
        " ",
        state.conflict && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsr-link", onClick: reload, children: "\u8F7D\u5165\u5DF2\u4FDD\u5B58\u8BBE\u7F6E" })
      ] })
    ] })
  ] });
}

// client/Conversation.jsx
var import_react4 = require("react");
var import_react_dom = require("react-dom");

// client/ReviewReport.jsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var severityLabels = { error: "\u5B9E\u8D28\u95EE\u9898", warning: "\u5F85\u6838\u5B9E", note: "\u63D0\u793A" };
var stageLabels = { initial: "\u521D\u5BA1", review: "\u521D\u5BA1", correction: "\u8865\u5BA1", retry: "\u8865\u5BA1", repair: "\u4E3B\u52A9\u624B\u4FEE\u6B63", verification: "\u5B9A\u5411\u590D\u5BA1" };
function sourceLabel(location) {
  const id = location?.split(" \xB7 ", 1)[0];
  if (id === "Q") return "\u672C\u8F6E\u7528\u6237\u8981\u6C42 \xB7 " + location;
  if (/^A\d+$/.test(id)) return "\u56DE\u7B54\u7B2C " + id.slice(1) + " \u6BB5 \xB7 " + location;
  if (/^U\d+$/.test(id)) return "\u6B64\u524D\u7528\u6237\u8981\u6C42 \xB7 " + location;
  if (/^E\d+$/.test(id)) return "\u4F1A\u8BDD\u8BB0\u5F55 \xB7 " + location;
  if (/^F\d+\.\d+$/.test(id)) return "\u6587\u4EF6\u5FEB\u7167 \xB7 " + location;
  return location;
}
function Finding({ finding, children }) {
  const evidence = evidenceParts(finding);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "dsr-finding", "data-severity": finding.severity, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: severityLabels[finding.severity] || "\u53D1\u73B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: checkLabels[finding.check] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsr-claim", children: finding.claim }),
    finding.claimLocation && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { className: "dsr-location", children: sourceLabel(finding.claimLocation) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { children: [
      evidence.quote && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u5BF9\u7167\u8BC1\u636E" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dd", { children: [
          evidence.location && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { className: "dsr-location", children: sourceLabel(evidence.location) }),
          evidence.quote
        ] })
      ] }),
      finding.reason && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u5224\u65AD\u4F9D\u636E" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: finding.reason })
      ] }),
      finding.suggestion && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u5EFA\u8BAE" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: finding.suggestion })
      ] })
    ] }),
    children
  ] });
}
function UsageTable({ label, usage }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { className: "dsr-model-note", children: usageLabel(usage) || "\u7528\u91CF\u672A\u63D0\u4F9B" }),
    usage && usage.requests !== 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dl", { className: "dsr-usage", children: usageDetails(usage).map(({ key, label: label2, value }) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: label2 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: value })
    ] }, key)) })
  ] });
}
function RemedyProgress({ jobs, busy, cancel }) {
  if (!jobs.length) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("section", { className: "dsr-remedies", "aria-label": "\u5904\u7406\u8FDB\u5EA6", children: jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsr-remedy", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsr-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: remedyPhases[job.phase] || "\u5904\u7406\u8FDB\u5EA6" }),
      remedyActive(job) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "dsr-link", type: "button", disabled: busy, onClick: () => cancel(job.id), children: "\u53D6\u6D88\u5904\u7406" })
    ] }),
    job.correctionTurn != null && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
      "\u4E3B\u52A9\u624B\u7B2C ",
      job.correctionTurn,
      " \u8F6E"
    ] }),
    job.steps?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { children: job.steps.map((step) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
      step.kind === "gap" ? "\u7F3A\u53E3" : "\u53D1\u73B0",
      " ",
      step.index + 1,
      " \xB7 ",
      remedyOutcomes[step.status] || step.status,
      step.detail && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: step.detail })
    ] }, step.kind + "/" + step.index)) }),
    job.note && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: job.note })
  ] }, job.id)) });
}
function ReportHistory({ history }) {
  if (!history?.length) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dsr-disclosure", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
      "\u6B64\u8F6E\u7684\u5386\u53F2\u62A5\u544A \xB7 ",
      history.length
    ] }),
    history.map((item) => {
      const record = { ...item, status: item.status || (item.result ? "done" : "error") };
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dsr-disclosure", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
          new Date(item.updatedAt).toLocaleString(),
          " \xB7 ",
          reviewLabel(record)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ReviewReport, { historical: true, review: record })
      ] }, item.revision);
    })
  ] });
}
function ReviewReport({ review, sessionId, turnId, addDraft, onDraft, store, busy = false, historical = false }) {
  const [all, setAll] = (0, import_react3.useState)(false);
  const [note, setNote] = (0, import_react3.useState)("");
  const [draftStatus, setDraftStatus] = (0, import_react3.useState)(null);
  const result = review.result;
  if (review.status === "running") return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", className: "dsr-hint", children: "\u6B63\u5728\u6838\u5BF9\u8FD9\u8F6E\u56DE\u7B54\u2026" });
  if (review.status === "error") return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsr-report", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "alert", className: "dsr-error", children: review.error || "\u672C\u8F6E\u5BA1\u67E5\u672A\u5B8C\u6210\u3002" }),
    review.usage && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UsageTable, { label: "\u5BA1\u67E5\u7528\u91CF", usage: review.usage }),
    !historical && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ReportHistory, { history: review.history })
  ] });
  if (!result) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsr-hint", children: "\u672A\u6536\u5230\u5BA1\u67E5\u62A5\u544A\u3002" });
  const model = result.model || {};
  const findings = orderedFindings(result.findings);
  const gaps = result.gaps || [];
  const legacy = !(result.schemaVersion >= 2);
  const notes = legacy ? result.limitations : result.scopeNotes;
  const jobs = review.remediation || [];
  const actionable = !historical && store && Number.isSafeInteger(review.revision);
  const pending = jobs.some(remedyActive);
  const fixable = (result.findings || []).flatMap((f, i) => f.repair ? [i] : []);
  function submit(action, body = {}) {
    return store.remedy({ turnId, revision: review.revision, action, ...body, ...note.trim() && action !== "cancel" ? { note: note.trim() } : {} });
  }
  function itemButton(kind, index, action) {
    if (!actionable) return null;
    const previous = jobs.findLast((job) => job.steps?.some((step2) => step2.kind === kind && step2.index === index));
    const step = previous?.steps?.find((item) => item.kind === kind && item.index === index);
    if (previous && (remedyActive(previous) || ["verified", "inapplicable"].includes(step?.status))) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { role: "status", children: remedyOutcomes[step.status] || remedyPhases[previous.phase] });
    }
    const selection = kind === "finding" ? { indices: [index] } : { gapIndices: [index] };
    const id = retryJobId(jobs, kind, index, action, note);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        className: "dsr-secondary",
        type: "button",
        disabled: busy || pending,
        onClick: () => submit(action, { ...selection, ...id ? { id } : {} }),
        children: action === "fix" ? "\u4FEE\u6B63\u5E76\u590D\u5BA1" : "\u8BF7\u4E3B\u52A9\u624B\u6838\u5B9E"
      }
    );
  }
  function draft() {
    try {
      addDraft(sessionId, turnId);
      setDraftStatus({ message: "\u8BF7\u6C42\u5DF2\u653E\u5165\u8F93\u5165\u6846\uFF0C\u53EF\u7F16\u8F91\u540E\u53D1\u9001\u3002" });
      onDraft?.();
    } catch (error) {
      setDraftStatus({ error: true, message: error.message || "\u65E0\u6CD5\u5199\u5165\u5F53\u524D\u4F1A\u8BDD\u8349\u7A3F\u3002" });
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsr-report", children: [
    result.summary && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: result.summary }),
    review.trigger?.reason && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "dsr-hint", children: [
      "\u5BA1\u67E5\u7F18\u7531 \xB7 ",
      review.trigger.reason
    ] }),
    result.reused && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsr-hint", children: "\u5DF2\u590D\u7528\u8FD9\u4EFD\u62A5\u544A\uFF0C\u672C\u6B21\u65B0\u589E\u6A21\u578B\u8BF7\u6C42 0 \u6B21\u3002" }),
    (all ? findings : findings.slice(0, 3)).map((f) => {
      const i = result.findings.indexOf(f);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Finding, { finding: f, children: itemButton("finding", i, f.repair ? "fix" : "verify") }, i);
    }),
    findings.length > 3 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsr-link dsr-disclose", "aria-expanded": all, onClick: () => setAll(!all), children: all ? "\u6536\u8D77\u5176\u4F59\u95EE\u9898" : `\u67E5\u770B\u5176\u4F59 ${findings.length - 3} \u9879` }),
    gaps.map((gap, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "dsr-finding", "data-severity": "warning", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "\u5173\u952E\u4E8B\u5B9E\u5F85\u6838\u5B9E" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: sourceLabel(gap.claimSource) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dsr-claim", children: gap.claim }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u7F3A\u5C11\u4F9D\u636E" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: gap.missing })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u5F71\u54CD\u5224\u65AD" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: gap.impact })
        ] })
      ] }),
      itemButton("gap", i, "verify")
    ] }, i)),
    notes?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dsr-disclosure", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
        legacy ? "\u539F\u62A5\u544A\u7684\u6838\u67E5\u9650\u5236" : "\u5BA1\u67E5\u8303\u56F4",
        " \xB7 ",
        notes.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { children: notes.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { children: line }, i)) })
    ] }),
    result.mainModel?.model && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { className: "dsr-model-note", children: [
      "\u4E3B\u56DE\u7B54\u6A21\u578B \xB7 ",
      [result.mainModel.provider, result.mainModel.model].filter(Boolean).join(" \xB7 ")
    ] }),
    (model.model || result.method === "local") && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { className: "dsr-model-note", children: result.method === "local" ? result.localLabel || "\u672C\u5730\u6838\u5BF9" : ["\u5BA1\u67E5\u6A21\u578B", model.provider, model.model, model.effort].filter(Boolean).join(" \xB7 ") }),
    actionable && findings.length + gaps.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dsr-disclosure", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("summary", { children: "\u8865\u5145\u5904\u7406\u4F9D\u636E" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dsr-stack", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u968F\u4E0B\u4E00\u6B21\u4FEE\u6B63\u6216\u6838\u5B9E\u53D1\u9001" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "textarea",
            {
              rows: 2,
              maxLength: 2e3,
              value: note,
              onChange: (e) => setNote(e.target.value),
              placeholder: "\u4F8B\u5982\uFF0C\u539F\u59CB\u5206\u7EC4\u5728 samples.csv\uFF0C\u7B2C 2 \u5217\u662F\u72EC\u7ACB\u6837\u672C\u7F16\u53F7\u3002"
            }
          )
        ] })
      ] }),
      fixable.length > 1 && !jobs.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          className: "dsr-primary",
          type: "button",
          disabled: busy || pending,
          onClick: () => submit("fix", { indices: fixable }),
          children: [
            "\u4FEE\u6B63\u5E76\u590D\u5BA1\u5168\u90E8 ",
            fixable.length,
            " \u9879"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RemedyProgress, { jobs, busy, cancel: (id) => submit("cancel", { id }) }),
    result.usage && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dsr-disclosure", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
        "\u7528\u91CF \xB7 ",
        usageLabel(result.usage) || "\u672A\u63D0\u4F9B"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UsageTable, { label: result.method === "local" ? "\u672C\u5730\u6838\u5BF9" : result.usage.requests === 1 ? "\u521D\u5BA1" : "\u539F\u62A5\u544A\u7528\u91CF", usage: result.usage }),
      result.usage.stages?.length > 1 && result.usage.stages.map((row, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UsageTable, { label: stageLabels[row.stage] || (i ? "\u8865\u5BA1" : "\u521D\u5BA1"), usage: { requests: 1, ...row.usage || row } }, i)),
      jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UsageTable, { label: "\u4E3B\u52A9\u624B\u5904\u7406", usage: job.usage?.correction }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UsageTable, { label: "\u5B9A\u5411\u590D\u5BA1", usage: job.usage?.verification })
      ] }, job.id))
    ] }),
    !historical && findings.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsr-followup", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: feedbackLabel(review.feedback) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsr-link", onClick: draft, children: "\u8D77\u8349\u590D\u6838\u8BF7\u6C42" }),
      draftStatus && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: draftStatus.error ? "alert" : "status", className: draftStatus.error ? "dsr-error" : "dsr-hint", children: draftStatus.message })
    ] }),
    !historical && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ReportHistory, { history: review.history })
  ] });
}

// client/Conversation.jsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function TurnReview({ sessionId, turn, addDraft }) {
  const [state, store] = useReviewSession(sessionId);
  const turnId = String(turn.turn);
  useTurnArrival(store, turnId);
  const review = state.byTurn.get(turnId)?.review;
  if (!review) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { className: "dsr dsr-turn", "data-state": review.status, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { children: reviewLabel(review) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ReviewReport, { ...{ review, sessionId, turnId, addDraft, store }, busy: state.busy }, review.updatedAt),
    review.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsr-link", disabled: state.busy, onClick: () => store.run(turnId), children: "\u91CD\u8BD5\u672C\u8F6E\u5BA1\u67E5" }),
    state.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsr-error", role: "alert", children: state.error })
  ] });
}
function SessionMenu({ anchor, close, titleId, children }) {
  const panel = (0, import_react4.useRef)(null);
  (0, import_react4.useLayoutEffect)(() => {
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const box = panel.current;
      const roomAbove = rect.top - 16;
      const roomBelow = window.innerHeight - rect.bottom - 16;
      const above = roomAbove >= Math.min(box.scrollHeight, 410) || roomAbove >= roomBelow;
      box.style.maxHeight = Math.max(96, above ? roomAbove : roomBelow) + "px";
      box.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - box.offsetWidth - 8)) + "px";
      box.style.top = above ? "auto" : rect.bottom + 6 + "px";
      box.style.bottom = above ? window.innerHeight - rect.top + 6 + "px" : "auto";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel.current);
    observer.observe(anchor.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    panel.current.focus();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  (0, import_react4.useEffect)(() => {
    const outside = (event) => {
      if (!panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) close(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor, close]);
  return (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { ref: panel, className: "dsr dsr-menu", role: "dialog", "aria-labelledby": titleId, tabIndex: -1, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsr-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { id: titleId, children: "\u4F1A\u8BDD\u5BA1\u67E5" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": "\u5173\u95ED\u4F1A\u8BDD\u5BA1\u67E5", onClick: () => close(true), children: "\xD7" })
    ] }),
    children
  ] }), document.body);
}
function ComposerReview({ sessionId, addDraft }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SessionControl, { sessionId, addDraft }, sessionId);
}
function ModeIcon({ mode, size = 19 }) {
  const paths = {
    manual: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "10", cy: "10", r: "6" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "m14.5 14.5 5 5" })
    ] }),
    key: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M6 20V4m0 1c5-3 8 3 13 0v9c-5 3-8-3-13 0" }) }),
    every: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: "7", y: "6", width: "12", height: "14", rx: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M4 16V4a1 1 0 0 1 1-1h10M10 13l2 2 4-5" })
    ] }),
    inherit: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_jsx_runtime3.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "m8 13 5-5m-3-1 2-2a4 4 0 0 1 6 6l-2 2m-2 4-2 2a4 4 0 0 1-6-6l2-2" }) }),
    unknown: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: "12", cy: "12", r: "8" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M8.5 12h.1m3.4 0h.1m3.4 0h.1" })
    ] })
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { "aria-hidden": "true", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: paths[mode] || paths.unknown });
}
function SessionControl({ sessionId, addDraft }) {
  const [state, store] = useReviewSession(sessionId);
  const [open, setOpen] = (0, import_react4.useState)(false);
  const [selected, setSelected] = (0, import_react4.useState)("latest");
  const [showReport, setShowReport] = (0, import_react4.useState)(false);
  const anchor = (0, import_react4.useRef)(null);
  const titleId = (0, import_react4.useId)();
  const modeName = (0, import_react4.useId)();
  const data = state.data;
  const turns = data?.turns || [];
  const selectedTurn = selected === "latest" ? turns.at(-1) : turns.find((turn) => turn.id === selected);
  const report = selectedTurn?.review;
  const close = (restore) => {
    setOpen(false);
    if (restore) anchor.current?.focus();
  };
  const latestReview = turns.findLast((turn) => turn.review)?.review;
  const running = turns.some((turn) => turn.review?.status === "running");
  const handling = turns.some((turn) => turn.review?.remediation?.some(remedyActive));
  const error = Boolean(state.error || latestReview?.status === "error");
  const mode = visibleMode(data, state.error);
  const status = state.error ? "\u5BA1\u67E5\u670D\u52A1\u5F02\u5E38" : running ? "\u6B63\u5728\u5BA1\u67E5" : handling ? "\u6B63\u5728\u5904\u7406\u5BA1\u67E5\u610F\u89C1" : error ? "\u6700\u8FD1\u4E00\u6B21\u5BA1\u67E5\u5931\u8D25" : "";
  const description = ["\u4F1A\u8BDD\u5BA1\u67E5", modes[mode] || (state.error ? "\u6A21\u5F0F\u672A\u77E5" : "\u6B63\u5728\u8BFB\u53D6\u6A21\u5F0F"), status].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        ref: anchor,
        className: "dsr dsr-trigger",
        "data-mode": mode,
        "aria-label": description,
        title: description,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        onClick: () => {
          if (!open) void store.refresh();
          setOpen(!open);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModeIcon, { mode }),
          (running || handling) && !state.error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("i", { className: "dsr-activity dsr-activity-running", "aria-hidden": "true" }) : error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("i", { className: "dsr-activity dsr-activity-error", "aria-hidden": "true", children: "!" }) : null
        ]
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(SessionMenu, { anchor, close, titleId, children: [
      state.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "dsr-error", role: "alert", children: [
        state.error,
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsr-link", onClick: store.refresh, children: "\u5237\u65B0" })
      ] }),
      !data && !state.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u2026" }),
      data && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("fieldset", { className: "dsr-mode-picker", disabled: state.busy, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("legend", { children: "\u89E6\u53D1\u65F6\u673A" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: Object.entries({ inherit: "\u8DDF\u968F\u5168\u5C40", ...modes }).map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { title: id === "inherit" ? "\u8DDF\u968F\u8BBE\u7F6E\u4E2D\u7684\u9ED8\u8BA4\u5BA1\u67E5\u65B9\u5F0F" : modeHelp[id], children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "radio", name: modeName, value: id, checked: data.mode === id, onChange: () => store.setMode(id) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ModeIcon, { mode: id, size: 16 }),
              label
            ] })
          ] }, id)) }),
          modes[mode] && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "dsr-hint", children: [
            data.mode === "inherit" ? modes[mode] + " \xB7 " : "",
            modeHelp[mode]
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SessionOptions, { data, store, busy: state.busy }),
        turns.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsr-stack", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u5BA1\u67E5\u5BF9\u8C61" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { value: selected, disabled: state.busy, onChange: (e) => {
              setSelected(e.target.value);
              setShowReport(false);
            }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "latest", children: "\u6700\u65B0\u5DF2\u5B8C\u6210\u8F6E\u6B21" }),
              turns.slice().reverse().map((turn) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: turn.id, children: turn.label || "\u7B2C " + turn.id + " \u8F6E" }, turn.id))
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsr-footer", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: "dsr-primary",
                disabled: state.busy || !selectedTurn || report?.status === "running",
                onClick: () => {
                  setShowReport(true);
                  void store.run(selectedTurn.id);
                },
                children: report?.status === "running" ? "\u6B63\u5728\u5BA1\u67E5\u2026" : "\u5BA1\u67E5\u6B64\u8F6E"
              }
            ),
            report && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "dsr-link", onClick: () => setShowReport(!showReport), children: showReport ? "\u6536\u8D77\u62A5\u544A" : "\u67E5\u770B\u62A5\u544A" })
          ] }),
          showReport && report && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ReviewReport, { review: report, sessionId, turnId: selectedTurn.id, addDraft, store, busy: state.busy, onDraft: () => close(false) }, selectedTurn.id + "/" + report.updatedAt)
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsr-hint", children: "\u7B2C\u4E00\u8F6E\u56DE\u7B54\u5B8C\u6210\u540E\u5373\u53EF\u5BA1\u67E5\u3002" })
      ] })
    ] })
  ] });
}
function SessionOptions({ data, store, busy }) {
  const saved = data.sessionInstructions || "";
  const [edited, setEdited] = (0, import_react4.useState)(null);
  const [savedMessage, setSavedMessage] = (0, import_react4.useState)("");
  const draft = edited ?? saved;
  const hint = standardsHint(draft, data.checks);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsr-stack", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u53D1\u73B0\u95EE\u9898\u540E" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { value: data.handling || "inherit", disabled: busy, onChange: (e) => store.setOptions({ handling: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: "inherit", children: [
          "\u8DDF\u968F\u5168\u5C40 \xB7 ",
          handlingLabels[data.effectiveHandling] || handlingLabels.manual
        ] }),
        Object.entries(handlingLabels).map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: id, children: label }, id))
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dsr-hint", children: handlingHelp[data.effectiveHandling] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { className: "dsr-disclosure", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("summary", { children: [
        "\u5BA1\u67E5\u6807\u51C6",
        saved && " \xB7 \u672C\u4F1A\u8BDD\u5DF2\u8FFD\u52A0"
      ] }),
      data.checks?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "dsr-hint", children: [
        "\u6838\u67E5\u9879 \xB7 ",
        data.checks.map((id) => checkLabels[id]).join("\u3001")
      ] }),
      data.globalInstructions && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "dsr-criteria", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "\u9ED8\u8BA4\u6807\u51C6" }),
        " ",
        data.globalInstructions
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "dsr-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u672C\u4F1A\u8BDD\u8FFD\u52A0\u6807\u51C6" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "textarea",
          {
            rows: 3,
            maxLength: 2e3,
            disabled: busy,
            value: draft,
            onChange: (e) => {
              setEdited(e.target.value);
              setSavedMessage("");
            },
            placeholder: "\u4F8B\u5982\uFF0C\u4E24\u6279\u72EC\u7ACB\u91C7\u6837\u5408\u5E76\u5206\u6790\u65F6\uFF0C\u8BF7\u6838\u5BF9\u6279\u6B21\u6548\u5E94\u3002"
          }
        )
      ] }),
      hint && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: hint }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsr-footer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "dsr-secondary",
            disabled: busy || draft === saved,
            onClick: async () => {
              if (await store.setOptions({ sessionInstructions: draft })) {
                setEdited(null);
                setSavedMessage("\u5DF2\u4FDD\u5B58");
              }
            },
            children: "\u4FDD\u5B58\u4F1A\u8BDD\u6807\u51C6"
          }
        ),
        savedMessage && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { role: "status", children: savedMessage })
      ] })
    ] })
  ] });
}
function ReviewIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { "aria-hidden": "true", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M13 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.5L13 3.5Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M13 3.5v6h6M8.5 14.7l2 2 4.7-4.8" })
  ] });
}

// client/styles.css
var styles_default = '.dsr { color: var(--dsw-alias-label-primary, CanvasText); font-family: inherit; font-size: 14px; line-height: 1.5; }\n.dsr *, .dsr { box-sizing: border-box; }\n.dsr h2, .dsr h3, .dsr p, .dsr dl, .dsr dd { margin: 0; }\n.dsr h2 { font-size: 18px; font-weight: 600; }\n.dsr h3, .dsr legend, .dsr-stack > span { font-size: 14px; font-weight: 600; }\n.dsr p { overflow-wrap: anywhere; }\n.dsr small { font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-secondary, GrayText); }\n.dsr select, .dsr textarea {\n  min-width: 0; border: 1px solid var(--dsw-alias-border-l3, ButtonBorder); border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1, Canvas); color: inherit; font: inherit; padding: 6px 9px;\n}\n.dsr textarea { width: 100%; resize: vertical; min-height: 68px; }\n.dsr :is(button, select, textarea, summary, input):focus-visible, .dsr-trigger:focus-visible {\n  outline: 2px solid var(--dsw-alias-link, #355ab2); outline-offset: 2px;\n}\n.dsr button, .dsr-trigger { cursor: pointer; font: inherit; }\n.dsr :disabled { cursor: default; opacity: .6; }\n.dsr-settings { display: grid; gap: 18px; max-width: 640px; }\n.dsr-settings header p, .dsr-hint, .dsr-model-note { color: var(--dsw-alias-label-secondary, GrayText); font-size: 13px; }\n.dsr-settings header p { margin-top: 4px; }\n.dsr-fields { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 18px; }\n.dsr-group {\n  min-width: 0; display: grid; gap: 10px; margin: 0; padding: 13px 15px;\n  border: 1px solid var(--dsw-alias-settings-card-stroke, ButtonBorder); border-radius: 12px;\n  background: var(--dsw-alias-settings-card-fill, Canvas);\n}\n.dsr-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }\n.dsr-row select { max-width: 100%; flex: 0 1 230px; }\n.dsr-stack { display: grid; gap: 6px; min-width: 0; }\n.dsr-checks legend { padding: 0 4px; }\n.dsr-presets { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }\n.dsr-presets > span { margin-inline-end: 4px; }\n.dsr-presets button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2, ButtonFace); border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; font-weight: 600; }\n.dsr-check-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px,100%),1fr)); gap: 10px; }\n.dsr-checks label { display: inline-flex; gap: 7px; align-items: center; }\n.dsr-checks input { width: 15px; height: 15px; accent-color: var(--dsw-alias-link, #355ab2); }\n.dsr-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }\n.dsr-primary {\n  padding: 7px 15px; background: var(--dsw-alias-label-primary, CanvasText);\n  color: var(--dsw-alias-bg-layer-1, Canvas); border: 0; border-radius: 8px;\n}\n.dsr-link { padding: 2px; border: none; background: transparent; color: inherit; text-decoration: underline; text-underline-offset: 3px; }\n.dsr-disclose { justify-self: start; }\n.dsr-error { color: var(--dsw-alias-state-error-primary, #b4473e); font-size: 13px; overflow-wrap: anywhere; }\n.dsr-trigger {\n  position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 30px; min-height: 30px; padding: 4px;\n  border: none; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, GrayText);\n}\n.dsr-trigger:is([data-mode="key"],[data-mode="every"]) { color: var(--dsw-alias-label-primary, CanvasText); }\n.dsr-trigger:hover, .dsr-trigger[aria-expanded="true"] { color: var(--dsw-alias-label-primary, CanvasText); background: var(--dsw-alias-bg-layer-2, ButtonFace); }\n.dsr-activity { position: absolute; bottom: 0; right: 0; display: grid; place-items: center; border-radius: 50%; width: 11px; height: 11px; background: var(--dsw-alias-bg-layer-1, Canvas); }\n.dsr-activity-running { border: 2px dotted currentColor; border-top-style: solid; animation: dsr-spin 1.3s linear infinite; }\n.dsr-activity-error { color: var(--dsw-alias-state-error-primary, #b4473e); border: 1px solid currentColor; font: bold normal 9px/1 sans-serif; }\n@keyframes dsr-spin { to { transform: rotate(360deg); } }\n@media (prefers-reduced-motion: reduce) { .dsr-activity-running { animation: none; } }\n.dsr-menu {\n  position: fixed; z-index: 150; overflow: auto; overscroll-behavior: contain; outline: none;\n  width: min(320px, calc(100vw - 16px)); padding: 14px;\n  display: grid; gap: 13px; border: 1px solid var(--dsw-alias-border-l3, ButtonBorder); border-radius: 13px;\n  background: var(--dsw-alias-bg-layer-1, Canvas); box-shadow: 0 6px 24px rgb(0 0 0 / .13);\n}\n.dsr-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.dsr-head button { min-width: 24px; min-height: 24px; background: transparent; border: none; color: inherit; font-size: 18px; line-height: 1; }\n.dsr-mode-picker { border: none; margin: 0; padding: 0; min-width: 0; }\n.dsr-mode-picker legend { padding: 0; margin-bottom: 7px; }\n.dsr-mode-picker > div { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }\n.dsr-mode-picker label { position: relative; }\n.dsr-mode-picker label > span { display: flex; align-items: center; gap: 7px; padding: 6px 8px; min-height: 34px; cursor: pointer; border: 1px solid var(--dsw-alias-border-l3, ButtonBorder); border-radius: 7px; }\n.dsr-mode-picker input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }\n.dsr-mode-picker input:checked + span { color: var(--dsw-alias-label-primary, CanvasText); background: var(--dsw-alias-bg-layer-2, ButtonFace); border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; font-weight: 600; }\n.dsr-mode-picker input:focus-visible + span { outline: 2px solid var(--dsw-alias-link, #355ab2); outline-offset: 2px; }\n.dsr-mode-picker p { margin-top: 7px; }\n.dsr-turn {\n  border: 1px solid var(--dsw-alias-border-l3, ButtonBorder); border-radius: 8px;\n  padding: 6px 10px; margin: 6px 0; color: var(--dsw-alias-label-secondary, GrayText); font-size: 13px;\n}\n.dsr-turn summary { cursor: pointer; width: fit-content; font-weight: 500; }\n.dsr-turn[open] > :not(summary) { margin-top: 8px; }\n.dsr-report { display: grid; gap: 10px; color: var(--dsw-alias-label-primary, CanvasText); overflow-wrap: anywhere; }\n.dsr-report p, .dsr-report dd, .dsr-report li { white-space: pre-wrap; }\n.dsr-finding { border-inline-start: 2px solid var(--dsw-alias-border-l2, ButtonBorder); padding-inline-start: 10px; }\n.dsr-finding[data-severity="error"] { border-color: var(--dsw-alias-state-error-primary, #b4473e); }\n.dsr-finding[data-severity="warning"] { border-color: var(--dsw-alias-state-warn-label, #a06518); }\n.dsr-finding header { display: flex; gap: 8px; align-items: baseline; font-size: 12px; color: var(--dsw-alias-label-secondary, GrayText); }\n.dsr-finding header b { color: var(--dsw-alias-label-primary, CanvasText); }\n.dsr-claim { font-weight: 600; margin-block: 3px; }\n.dsr-location { display: block; overflow-wrap: anywhere; user-select: text; }\n.dsr-finding dl > div { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 8px; margin-top: 3px; }\n.dsr-finding dt { color: var(--dsw-alias-label-secondary, GrayText); }\n.dsr-limit ul { margin: 2px 0 0; padding-inline-start: 1.4em; }\n.dsr-followup { border-top: 1px solid var(--dsw-alias-border-l3, ButtonBorder); padding-top: 9px; display: grid; gap: 6px; justify-items: start; }\n.dsr-followup > p { color: var(--dsw-alias-label-secondary, GrayText); font-size: 12px; }\n.dsr-secondary { padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l3, ButtonBorder); border-radius: 7px; color: inherit; background: var(--dsw-alias-bg-layer-1, Canvas); }\n@media (pointer: coarse) { .dsr-trigger { min-width: 36px; min-height: 36px; } .dsr-mode-picker label > span, .dsr-secondary { min-height: 40px; } }\n.dsr-disclosure { min-width: 0; }\n.dsr-disclosure summary { cursor: pointer; color: var(--dsw-alias-label-secondary, GrayText); }\n.dsr-disclosure[open] > :not(summary) { margin-top: 7px; }\n.dsr-disclosure ul, .dsr-remedy ul { padding-inline-start: 1.4em; margin-block: 4px; }\n.dsr-criteria { white-space: pre-wrap; }\n.dsr-finding > button, .dsr-finding > small[role="status"] { display: inline-block; margin-top: 7px; }\n.dsr-remedies { display: grid; gap: 8px; }\n.dsr-remedy { padding: 8px 10px; border-inline-start: 2px solid var(--dsw-alias-link, #355ab2); }\n.dsr-usage { display: grid; grid-template-columns: repeat(auto-fit, minmax(95px, 1fr)); gap: 4px 10px; }\n.dsr-usage dt { font-size: 12px; color: var(--dsw-alias-label-secondary, GrayText); }\n.dsr-usage dd { font-variant-numeric: tabular-nums; }\n.dsr-disclosure .dsr-model-note { margin-inline-start: 6px; }\n';

// client/index.jsx
var inject = ["slots", "sessions", "conversation"];
function apply(ctx) {
  ctx.effect(() => {
    const node = document.createElement("style");
    node.textContent = styles_default;
    document.head.appendChild(node);
    return () => node.remove();
  }, "dsh-review: styles");
  const register = (name, options, component) => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component));
  register("settings.section", { id: "dsh-review", order: 65, label: () => "\u56DE\u7B54\u5BA1\u67E5" }, Settings);
  register("settings.section.icon", { id: "dsh-review" }, ReviewIcon);
  const addDraft = (sessionId, turnId) => prepareFollowup(ctx, sessionId, turnId);
  const props = () => ({ addDraft });
  register("conversation.input.left", { id: "dsh-review", order: 55, inject: props }, ComposerReview);
  register("conversation.chat.turnTail", { id: "dsh-review", order: 65, inject: props }, TurnReview);
}
return module.exports; } });
