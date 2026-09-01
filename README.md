# dsh-web-search-brightdata

Bright Data SERP API 搜索 provider，注册进 DSH 的 `ctx.web` seam。与
`dsh-web-search-tavily-pool` 同一套待遇：

- **Key 池**：`~/.dsh/.dsh-web-search-brightdata.json`（Settings UI 写入，
  权威来源）；缺省回退 `BRIGHTDATA_API_KEYS` / `BRIGHTDATA_API_KEY`
  （credentials service → `~/.dsh/.credentials.yaml` 直读）
- **轮换与冷却**：401/403 冷却 30 分钟，429 冷却 1 分钟，其他可重试错误
  5 分钟；失败换下一把活跃 key
- **zone**：池级配置，默认 `serp_api_dsh`，Settings 里可改
- **解析**：默认 `data_format: html`（URL 精确，解析 organic 锚点 + `<h3>`
  标题 + `VwiC3b` 摘要）；`markdown` 模式解析 `### 标题` 块并用 › 面包屑
  重建 URL（尽力而为）。0 结果视为失败，向上一级（strategy）暴露原因
- **Settings**："Bright Data SERP" 分区：zone 编辑、key 增删停启用、单把/
  全部测试、重置冷却；全部操作即时热生效

免费额度：Bright Data 注册赠送请求额度（SERP API 亦有 5K 次/月档），
多账号 token 可加多把进池轮换。

## 安装

```sh
./install.sh            # 拷入 ~/.dsh/profiles/node_modules 并注册 patch 行
```

或作为 profile 依赖安装（pnpm `file:` link），再在 `cordis.patch.yml` 注册：

```yaml
- insert:
    - id: web-search-brightdata
      name: 'dsh-web-search-brightdata'
```

strategy 链里把 `brightdata` 加进 backends（Settings 的 strategy 分区或
`~/.dsh/.dsh-web-search-strategy.json`）即可参与 fallback/parallel。

## 更新日志

### 1.0.1

- 修复：Google html SERP 改版后有机结果不再以"绝对 URL 锚点 + `<h3>` 标题"结构出现，
  html 解析器恒定解析出 0 条（报 `parsed 0 results from html SERP`）。
- 现将默认 `dataFormat` 从 `html` 改为 `markdown`（Bright Data 服务端提取，不受
  Google 标记变化影响）。如仍需 html 解析，可在插件配置中显式传 `dataFormat: "html"`。
