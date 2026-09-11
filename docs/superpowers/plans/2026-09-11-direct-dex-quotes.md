# Browser-direct DEX Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将持续行情轮询从 Cloudflare Worker 转移到每个使用者的浏览器，并让临时限流自动恢复且不遮挡看板。

**Architecture:** 公共列表、登录、收藏、添加、编辑、删除和历史估值继续通过 Worker 与 Supabase；页面拿到公共 CA 后，按链、每批最多 30 个地址直接请求 DEX Screener。保留现有 `/api/quotes` 端点一个版本用于快速回滚，但正常页面不再调用它。行情错误使用独立状态，429 时保留旧行情、按 `Retry-After` 冷却并自动重试，成功后自动清除提示。

**Tech Stack:** React 19、Vinext、Cloudflare Workers、Node test runner、DEX Screener REST API

**Spec:** 2026-09-11 会话中已确认的边界设计：浏览器直连 DEX Screener，保留旧行情，显示冷却倒计时并自动恢复。

## Global Constraints

- 不修改 Supabase 表结构、RLS、账号、收藏或公共列表同步逻辑。
- 不改变添加合约时的链识别与 GeckoTerminal 历史估值流程。
- DEX Screener 请求继续按链分组，每批最多 30 个 CA，正常刷新间隔为 60 秒。
- 429 不立即重试，不转发到 Worker；遵循 `Retry-After`，最短 60 秒、最长 1 小时。
- 行情失败时保留最后一次成功数据并标记为旧行情；没有旧数据时继续显示“等待行情”。
- 只有表单、登录、数据库等操作错误使用顶部红色错误框；行情状态显示在底部行情区域。
- 保留 `/api/quotes` 和签名 proof 一个发布周期，确认浏览器直连稳定后再单独清理。
- 不新增依赖。

---

### Task 1: 固化批量行情和冷却规则

**Files:**
- Create: `lib/quote-refresh.mjs`
- Modify: `tests/domain.test.mjs`
- Create: `tests/quote-refresh.test.mjs`

**Interfaces:**
- Consumes: `fetchQuotes(chain, addresses, fetcher)` from `lib/domain.mjs`
- Produces: `retryDelayMs(error)`, `mergeQuoteBatch(previous, chain, incoming)`, `quoteFailure(error, now)` from `lib/quote-refresh.mjs`

- [ ] **Step 1: 为浏览器直连 URL 和 429 写失败测试**

在 `tests/domain.test.mjs` 中导入 `fetchQuotes`，新增测试：

```js
test('fetchQuotes uses the public browser-safe batch endpoint',async()=>{
 const ca='0x'+'a'.repeat(40);let requested='';
 const quotes=await fetchQuotes('base',[ca],async url=>{
  requested=url;
  return Response.json([{chainId:'base',baseToken:{address:ca,name:'A',symbol:'A'},liquidity:{usd:10},priceUsd:'1',marketCap:100}]);
 });
 assert.equal(requested,`https://api.dexscreener.com/tokens/v1/base/${ca}`);
 assert.equal(quotes[0].marketCap,100);
});

test('fetchQuotes exposes DEX retry timing without retrying',async()=>{
 let calls=0;
 await assert.rejects(
  fetchQuotes('solana',['So11111111111111111111111111111111111111112'],async()=>{
   calls++;
   return new Response('',{status:429,headers:{'Retry-After':'90'}});
  }),
  error=>error.status===429&&error.retryAfter==='90'
 );
 assert.equal(calls,1);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/domain.test.mjs`

Expected: FAIL，因为 `fetchQuotes` 尚未导入到测试文件。

- [ ] **Step 3: 只修改测试导入并确认现有实现满足浏览器直连契约**

```js
import {normalizeCA,manualCap,selectQuote,fetchQuotes} from '../lib/domain.mjs';
```

Run: `node --test tests/domain.test.mjs`

Expected: PASS。这个步骤证明无需复制行情解析代码到 React 组件。

- [ ] **Step 4: 为行情合并和冷却写失败测试**

创建 `tests/quote-refresh.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDelayMs,mergeQuoteBatch,quoteFailure} from '../lib/quote-refresh.mjs';

test('retry delay follows Retry-After within 60–3600 seconds',()=>{
 assert.equal(retryDelayMs({retryAfter:'90'}),90000);
 assert.equal(retryDelayMs({retryAfter:'2'}),60000);
 assert.equal(retryDelayMs({retryAfter:'9999'}),3600000);
 assert.equal(retryDelayMs({}),60000);
});

test('missing quotes retain the previous value as stale',()=>{
 const previous={'base:a':{ca:'a',price:1,marketCap:100,status:'ok'}};
 const next=mergeQuoteBatch(previous,'base',[{ca:'a',price:null,marketCap:null,status:'missing'}]);
 assert.deepEqual(next['base:a'],{ca:'a',price:1,marketCap:100,status:'stale'});
 assert.notEqual(next,previous);
});

test('429 produces a timed notice while other failures use a neutral retry notice',()=>{
 assert.deepEqual(quoteFailure({status:429,retryAfter:'90'},1000),{
  message:'DEX Screener 暂时限流，保留上次行情',retryAt:91000
 });
 assert.deepEqual(quoteFailure({status:502},1000),{
  message:'行情源暂时不可用，保留上次行情',retryAt:61000
 });
});
```

- [ ] **Step 5: 运行测试并确认 RED**

Run: `node --test tests/quote-refresh.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/quote-refresh.mjs`.

- [ ] **Step 6: 实现最小纯函数模块**

创建 `lib/quote-refresh.mjs`：

```js
export function retryDelayMs(error){
 const seconds=Number(error?.retryAfter);
 return Math.min(3600,Math.max(60,Number.isFinite(seconds)?seconds:60))*1000;
}

export function mergeQuoteBatch(previous,chain,incoming){
 const next={...previous};
 for(const quote of incoming){
  const key=chain+':'+quote.ca;
  next[key]=quote.status==='missing'&&previous[key]
   ? {...previous[key],status:'stale'}
   : quote;
 }
 return next;
}

export function quoteFailure(error,now=Date.now()){
 return {
  message:error?.status===429
   ? 'DEX Screener 暂时限流，保留上次行情'
   : '行情源暂时不可用，保留上次行情',
  retryAt:now+retryDelayMs(error)
 };
}
```

- [ ] **Step 7: 验证并提交纯逻辑**

Run: `node --test tests/domain.test.mjs tests/quote-refresh.test.mjs`

Expected: PASS。

```bash
git add lib/quote-refresh.mjs tests/domain.test.mjs tests/quote-refresh.test.mjs
git commit -m "test: define direct quote refresh behavior"
```

---

### Task 2: 将持续行情改成浏览器直连并修复提示状态

**Files:**
- Modify: `app/board.tsx`
- Test: `tests/quote-refresh.test.mjs`

**Interfaces:**
- Consumes: `fetchQuotes(chain, addresses)` from `lib/domain.mjs`
- Consumes: `mergeQuoteBatch`, `quoteFailure` from `lib/quote-refresh.mjs`
- Produces: 页面级 `quoteNotice: {message:string; retryAt:number}|null` 状态和自动恢复行为

- [ ] **Step 1: 添加一个会约束成功后清除状态的失败测试**

在 `lib/quote-refresh.mjs` 计划导出 `secondsUntil(retryAt, now)`，并先在 `tests/quote-refresh.test.mjs` 新增：

```js
test('countdown reaches zero without becoming negative',()=>{
 assert.equal(secondsUntil(61500,1000),61);
 assert.equal(secondsUntil(1000,1000),0);
 assert.equal(secondsUntil(500,1000),0);
});
```

同时把导入改为：

```js
import {retryDelayMs,mergeQuoteBatch,quoteFailure,secondsUntil} from '../lib/quote-refresh.mjs';
```

- [ ] **Step 2: 运行并确认 RED**

Run: `node --test tests/quote-refresh.test.mjs`

Expected: FAIL because `secondsUntil` is not exported.

- [ ] **Step 3: 实现倒计时函数并确认 GREEN**

```js
export function secondsUntil(retryAt,now=Date.now()){
 return Math.max(0,Math.ceil((retryAt-now)/1000));
}
```

Run: `node --test tests/quote-refresh.test.mjs`

Expected: PASS。

- [ ] **Step 4: 在 Board 中拆分业务错误和行情状态**

在 `app/board.tsx`：

1. 导入 `fetchQuotes`、`mergeQuoteBatch`、`quoteFailure`、`secondsUntil`。
2. 保留现有 `error`，仅用于登录、表单、数据库和复制错误。
3. 新增：

```ts
const [quoteNotice,setQuoteNotice]=useState<{message:string;retryAt:number}|null>(null);
const [quoteClock,setQuoteClock]=useState(Date.now());
```

4. 新增只在冷却期间运行的一秒计时器，用于更新倒计时；组件卸载时清理。
5. 顶部 `{error && ...}` 不再接收自动行情刷新错误。

- [ ] **Step 5: 将行情请求改为浏览器直连**

在 `refresh` 中把：

```ts
const d=await api('quotes',{chain:c,addresses:batch.map(t=>t.ca),proofs:batch.map(t=>t.proof)});
```

替换为：

```ts
const incoming=await fetchQuotes(c,batch.map(t=>t.ca));
setQuotes(previous=>mergeQuoteBatch(previous,c,incoming));
```

错误分支必须：

```ts
const failure=quoteFailure(err);
setQuoteNotice(failure);
nextQuote.current=failure.retryAt;
return;
```

完整批次成功后必须：

```ts
setQuoteNotice(null);
nextQuote.current=Date.now()+60000;
setUpdated(new Date().toLocaleTimeString('zh-CN'));
```

不得在直接请求遇到 429 后调用 `/api/quotes`，以免把同一次限流放大为第二次请求。

- [ ] **Step 6: 精确安排冷却结束后的自动重试**

新增 effect：当 `quoteNotice.retryAt` 存在时，只设置一个 `setTimeout`；到期后把 `nextQuote.current` 归零并调用 `refresh()`。notice 改变或组件卸载时清理 timeout。原有 60 秒定时刷新保留，`quoteBusy` 继续防止重叠请求。

- [ ] **Step 7: 修改底部行情状态和手动刷新按钮**

冷却期间：

- 显示 `DEX Screener 暂时限流，保留上次行情 · N 秒后自动重试`；
- 禁用“刷新行情”，避免用户连续点击；
- 表格继续显示最后成功行情，原有“旧行情”标记继续生效。

成功后自动恢复为 `最近查询 HH:mm:ss`，无需用户关闭提示。

- [ ] **Step 8: 类型检查和完整测试**

Run: `npm test`

Expected: all tests PASS。

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors。

Run: `npm run build`

Expected: Vinext build completes and emits `dist/server/wrangler.json`。

- [ ] **Step 9: 提交页面改动**

```bash
git add app/board.tsx lib/quote-refresh.mjs tests/quote-refresh.test.mjs
git commit -m "fix: fetch live quotes from each browser"
```

---

### Task 3: 更新说明、发布并验证真实限流路径

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Cloudflare GitHub 自动部署配置，生产分支 `main`
- Produces: 可回滚、经过线上验证的发布版本

- [ ] **Step 1: 更新数据流说明**

在 `README.md` 的行情说明中明确：

```text
公共列表每 30 秒从 Supabase 同步；实时行情由每个打开的浏览器直接向
DEX Screener 查询，按链每 60 秒批量刷新，每批最多 30 个 CA。
Cloudflare Worker 仍负责认证、列表写入和历史估值，不缓存持续行情。
```

补充：DEX Screener 429 时遵循 `Retry-After`，页面保留旧行情并自动恢复。

- [ ] **Step 2: 最终验证**

Run: `npm test`

Expected: all tests PASS。

Run: `npm run typecheck`

Expected: exit 0。

Run: `npm run build`

Expected: build succeeds。

Run: `npx wrangler deploy --config dist/server/wrangler.json --dry-run`

Expected: Worker bundle validates without upload errors。

- [ ] **Step 3: 提交文档并推送**

```bash
git add README.md docs/superpowers/plans/2026-09-11-direct-dex-quotes.md
git commit -m "docs: explain browser-direct quote refresh"
git push origin main
```

Expected: Cloudflare 的 GitHub 构建自动开始并成功部署。

- [ ] **Step 4: 线上验收**

在生产地址验证：

1. 公共列表仍加载 Supabase 中的记录。
2. 浏览器网络请求出现 `https://api.dexscreener.com/tokens/v1/...`。
3. 持续刷新不再调用 `/api/quotes`。
4. Solana 和 Robinhood 两条记录均显示当前币价、市值、24h 涨幅和倍数。
5. 临时 429 时旧行情不清空，底部出现倒计时，冷却后自动恢复。
6. 登录、收藏、添加、编辑、删除和历史市值查询行为不变。

- [ ] **Step 5: 保留快速回滚点**

本次不删除 Worker 的 `/api/quotes`。若线上浏览器因地区网络或 DEX Screener CORS 政策变化而无法直连，可回滚 Task 2 的提交，恢复 Worker 转发；清理旧端点另开一次变更，不和本次修复混合。
