# 腾讯思维导图 API 抓取分析报告

> **抓取日期:** 2026-05-20
> **目标:** https://doc.weixin.qq.com/mind/m4_AeUArAYSAH4CNBZS58tR4R369W6ZQ
> **工具:** Chrome DevTools MCP + website-to-api 流程

---

## 一、API 端点总结

| 端点 | 方法 | 用途 | 认证 |
|------|------|------|------|
| `/dop-api/mind/data/get?id={id}&xsrf={token}` | GET | 读取思维导图全部数据 | Cookie: wedoc_sid |
| `/wedoc/editnotify` | POST | 编辑通知/触发保存 | Cookie + xsrf |
| `/diskauth/get_file_auth` | POST | 文件权限校验 | Cookie + xsrf |
| `/wedoc/meta_info` | POST | 文档元信息 | Cookie + xsrf |

**保存机制:** 非 RESTful 单次保存，而是通过 OT（Operational Transformation）协同协议实时同步。前端操作 → WebSocket 或 `editnotify` → 服务器合并。

---

## 二、数据格式详解

### 2.1 顶层结构

```json
{
  "retcode": 0,
  "data": {
    "collab_client_vars": {
      "fileData": "<stringified JSON>",
      "padId": "...",
      "padType": "mind",
      "websocket": true,
      "rev": 824,
      "dver": "1.2.0"
    }
  }
}
```

### 2.2 fileData 核心结构（节点树）

```json
{
  "content": [{
    "rootTopic": {
      "id": "root",
      "title": { /* 富文本对象 */ },
      "collapse": false,
      "children": {
        "detached": [],
        "attached": [
          {
            "id": "唯一ID",
            "title": "字符串 或 富文本对象",
            "children": {
              "attached": [ /* 子节点 */ ],
              "summary": []  // 概要/总结
            },
            "position": { "x": 91.07, "y": 50.76 },
            "collapse": false,
            "style": { "fontWeight": "bold" },
            "boundaries": [],          // 外框引用
            "markers": [{              // 标记图标
              "markerId": "symbol-question",
              "color": "#f88825"
            }],
            "freshTitle": true,        // 新增节点标识
            "images": [],
            "imageAlign": "up",
            "extensions": {}           // 自定义扩展数据
          }
        ]
      },
      "style": { "color": "#1f1f1f" },
      "extensions": {
        "structureClass.unbalanced": { "right-number": 6 }
      },
      "structureClass": "unbalanced",
      "summaries": [                   // 根级别概要
        { "id": "...", "range": [0,0], "topicId": "..." }
      ]
    }
  }],
  "metaData": {}
}
```

### 2.3 关联线（Relationships）

顶级结构：

```json
{
  "relationships": [
    {
      "id": "wojspGZJT1M5B6DUeAkil",
      "end1Id": "源节点ID",
      "end2Id": "目标节点ID",
      "title": "",
      "controlPoints": {
        "0": { "x": 69.35, "y": 199.62 },
        "1": { "x": 43.65, "y": 90.51 }
      },
      "lineEndPoints": {
        "0": { "x": 78, "y": 3.12 },
        "1": { "x": 29, "y": 0 }
      },
      "style": { "lineColor": "#319B62" }
    }
  ]
}
```

### 2.4 外框（Boundaries）

挂载在节点上：

```json
{
  "id": "边界ID",
  "title": { /* 富文本 - 外框标题 */ },
  "range": [0, 1]  // 覆盖的子节点索引范围
},
"boundaries": [{ "id": "...", "range": [0,1] }]
```

### 2.5 概要/总结（Summaries）

两种形式：
1. **节点级 summary** — `children.summary[]`
2. **顶级 summaries** — 通过 `range` 指定覆盖的子节点范围

```json
// 根级别
"summaries": [
  { "id": "...", "range": [5,5], "topicId": "关联节点ID" }
]

// 节点级
"summary": [{
  "id": "...",
  "title": "概要文本"
}]
```

### 2.6 标题富文本格式

```json
{
  "type": "document",
  "children": [{
    "type": "paragraph",
    "children": [{
      "type": "text",
      "text": "显示文本",
      "color": "#1f1f1f"
    }]
  }],
  "paddingLeft": 0,
  "paddingRight": 0,
  "paddingTop": 0,
  "paddingBottom": 0,
  "anchor": 1,
  "whiteSpaceType": 0,
  "anchorCenter": false,
  "docSizeType": -2,
  "columnNumber": 1,
  "columnSpace": 0,
  "handingChar4OneLine": false,
  "handingMaxSpace": -1,
  "tailWhitespaceCalculation": "exclude"
}
```

---

## 三、项目实现对比

### 3.1 项目使用的库

| 维度 | 腾讯文档 | 本项目 (DrawWork) |
|------|---------|------------------|
| **渲染引擎** | 自研 Canvas/SVG | **simple-mind-map** 库 |
| **数据格式** | 递归树 `rootTopic → children.attached[]` | 同上 + 额外 `roots[]` 支持多根 |
| **富文本标题** | 完整的 Document/Paragraph/Text 对象 | 纯文本 + `_tencentMeta` 保留原格式 |
| **关联线** | `relationships[]` 数组 | `AssociativeLine` 插件 |
| **外框** | `boundaries[]` + 外框标题 | 未实现（通过 `_tencentMeta` 保留） |
| **标记图标** | `markers[]` 数组 | 未实现 |
| **概要/总结** | `summaries[]` + range 机制 | `GENERALIZATION` 命令 + `extension` 存储 |
| **布局** | `structureClass: "unbalanced"` 自定义 | `UnbalancedLayoutPlugin` 插件 |
| **数据持久化** | OT 实时协同 + JSONB 存储 | `api.put /tencentmind` 全量保存 |

### 3.2 格式转换桥梁

项目通过 `tencent-mind-utils.js` 实现双向转换：

```
腾讯格式 (rootTopic)  ──tencentToSimpleMindMap()──▶  simple-mind-map 格式
simple-mind-map 格式  ──simpleMindMapToTencent()──▶  腾讯格式 (rootTopic)
```

**关键转换逻辑：**

| 腾讯字段 | simple-mind-map 字段 | 方向 |
|---------|-------------------|------|
| `title` (富文本) | `data.text` (纯文本) | 提取/重建 |
| `id` | `data._tencentMeta.id` | 保留 |
| `collapse` | `data.expand` (取反) | 转换 |
| `style.fontWeight` | `data.bold` | 转换 |
| `markers` | `data._tencentMeta.markers` | 保留 |
| `boundaries` | `data._tencentMeta.boundaries` | 保留 |
| `position` | `data._tencentMeta.position` | 保留 |
| `extensions` | `data._tencentMeta.extensions` | 保留 |
| `relationships[]` | `associativeLine.lineList` | 转换 |
| `summaries[]` | `generalization` 命令 | 特殊处理 |

### 3.3 功能覆盖对比

| 功能 | 腾讯文档 | 本项目 (TencentMindEditor) | 差距 |
|------|---------|--------------------------|------|
| **节点创建** | ✅ | ✅ `INSERT_NODE` / `INSERT_CHILD_NODE` | 无 |
| **节点拖动** | ✅ | ✅ Drag 插件 (含 monkey-patch) | 无 |
| **关联线** | ✅ relationships[] | ✅ AssociativeLine 插件 | 无 |
| **概要/总结** | ✅ summaries[] + range | ✅ ADD_GENERALIZATION 命令 | 无 |
| **外框** | ✅ boundaries[] | ❌ 仅保留元数据 | ⚠️ 未实现UI |
| **标记图标** | ✅ markers[] | ❌ 仅保留元数据 | ⚠️ 未实现UI |
| **富文本标题** | ✅ 段落+颜色+样式 | ❌ 纯文本 | ⚠️ 未实现 |
| **图片/视频** | ✅ images[] | ✅ 自定义 media 扩展 | 无 |
| **多布局** | ✅ 逻辑结构/鱼骨图等 | ✅ 6种布局 | 无 |
| **主题** | ✅ `theme.topic` | ✅ 多种主题 | 无 |
| **不平衡布局** | ✅ structureClass | ✅ UnbalancedLayoutPlugin | 无 |
| **实时协同** | ✅ WebSocket + OT | ❌ 无 | ⚠️ |
| **版本历史** | ✅ 内置 | ❌ 通过画布历史 | ⚠️ |

---

## 四、关键发现

### 4.1 保存机制特殊点

腾讯文档使用 **OT 协同协议**实时同步，而非简单的 REST 保存。前端每次操作产生一个 operation，通过 WebSocket 或 HTTP 批量提交。这意味着无法通过单次 API 调用"保存"数据，而是需要模拟 operation 序列。

### 4.2 项目架构优势

本项目通过 `_tencentMeta` 元数据挂载策略，实现了**无损往返转换**。所有腾讯原生属性在转换到 simple-mind-map 时被保留，转换回去时完整恢复，做到了格式兼容。

### 4.3 待补充功能

从 API 分析来看，腾讯思维导图还有以下功能在当前项目未实现：
1. **外框 UI** — 节点分组边框 + 标题
2. **标记图标** — 优先级/进度/问号等图标
3. **富文本标题** — 标题内部分文字颜色、样式

---

## 五、参考文件

- 旧版参考数据: `reference/tencent-mindmap-ee2-reference.json` (首次抓取, 不含新节点)
- 今日快照: `reference/tencent-mind-api-snapshot-20260520.json` (含新增节点)
- 今日全量数据: `reference/tencent-mindmap-ee2-20260520-with-new-nodes.json`
- 工具库: `frontend/src/lib/tencent-mind-utils.js`
- 编辑器: `frontend/src/components/Editor/TencentMindEditor.jsx`
- 数据模型: `backend/src/models/tencentMind.js` / `backend/src/models/mindMap.js`
