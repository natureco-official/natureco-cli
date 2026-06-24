---
name: mcp-builder
description: MCP (Model Context Protocol) server geliştirme rehberi. AI agent'lar için araç expose etmek istediğinde bu skill'i yükle.
metadata: {"natureco": {"requires": {"bins": ["npx", "node"]}, "os": ["darwin","linux"]}}
---

# MCP Builder Skill

AI agent'ların tool, resource ve prompt olarak kullanabileceği MCP server'ları geliştirmek için rehber.

## MCP Nedir

Anthropic'in açık protokolü. AI modeller ile veri kaynakları/araçlar arasında standart bağlantı. JSON-RPC tabanlı, server-client mimarisi.

## Ne Zaman Kullan

- NatureCo CLI'yi bir AI agent'a tool olarak bağlamak
- Yeni bir MCP server sıfırdan yazmak
- Mevcut bir API/CLI aracını MCP'ye çevirmek
- stdio vs HTTP+SSE vs streamable-HTTP transport seçmek
- fastmcp (Python) vs mcporter (Node) arasında seçim yapmak

## Hızlı Başlangıç (Python - fastmcp)

```python
from fastmcp import FastMCP

mcp = FastMCP("natureco-tools")

@mcp.tool()
def scan_repo(path: str, max_files: int = 200) -> dict:
    """NatureCo CLI üzerinden repo tarar."""
    import subprocess
    result = subprocess.run(
        ["natureco", "scan", path, "--max", str(max_files)],
        capture_output=True, text=True, check=True,
    )
    return {"output": result.stdout}

if __name__ == "__main__":
    mcp.run()
```

## Hızlı Başlangıç (Node - mcporter)

```typescript
import { McpServer } from "mcporter";

const server = new McpServer({ name: "natureco-tools", version: "1.0.0" });

server.tool("scan_repo", {
  description: "NatureCo CLI üzerinden repo tarar",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      max_files: { type: "integer", default: 200 },
    },
    required: ["path"],
  },
}, async ({ path, max_files }) => {
  return { content: [{ type: "text", text: `Scanned ${path}` }] };
});

await server.listen({ port: 3000 });
```

## NatureCo için En İyi Pratikler

- **subprocess.run**: NatureCo CLI'yi subprocess olarak çağır
- **Type hints**: tüm tool parametrelerine açık tip ver
- **Docstring**: her tool'un ilk satırı açıklama olmalı
- **Async tools**: I/O işlemleri için async tanımla
- **Error handling**: subprocess.CalledProcessError'ı yakala

## Debug

```bash
# MCP Inspector ile test
npx @modelcontextprotocol/inspector python my_server.py

# stdIO sunucu stdout'a yazma (protokol bozulur)
# Tüm logları stderr'e yönlendir
```

## Production Kontrol Listesi

- Her tool için timeout koy
- Rate limiting uygula
- Pagination ekle (büyük listeler için)
- OAuth 2.1 ile auth ekle (remote sunucular için)
- Her tool call'unu logla

## Reference

- Spec: https://modelcontextprotocol.io
- Python SDK: https://github.com/jlowin/fastmcp
- Node SDK: https://github.com/mcporter-ai/mcporter
