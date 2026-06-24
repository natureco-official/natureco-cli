/**
 * notebook_edit - Jupyter notebook duzenleme (v4.9.0)
 *
 * Hermes notebook_edit'ine benzer. .ipynb dosyalarini oku, duzenle, yaz.
 */

const fs = require("fs");
const path = require("path");

async function notebookEdit({ filePath, cellIndex, operation = "read", newSource = null, newType = null }) {
  if (!filePath) return { success: false, error: "filePath gerekli" };

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return { success: false, error: `Dosya bulunamadi: ${resolved}` };

  try {
    const content = JSON.parse(fs.readFileSync(resolved, "utf8"));

    if (operation === "read") {
      if (cellIndex === undefined) {
        // Tum notebook'u ozetle
        const summary = content.cells?.map((c, i) => ({
          index: i,
          type: c.cell_type,
          source: Array.isArray(c.source) ? c.source.join("") : c.source,
          outputs: c.outputs?.length || 0,
        })) || [];
        return { success: true, file: resolved, cells: content.cells?.length || 0, summary };
      }
      const cell = content.cells?.[cellIndex];
      if (!cell) return { success: false, error: `Hucre bulunamadi: ${cellIndex}` };
      return { success: true, cell: { index: cellIndex, type: cell.cell_type, source: cell.source } };
    }

    if (operation === "update") {
      if (cellIndex === undefined) return { success: false, error: "cellIndex gerekli" };
      if (newSource === undefined) return { success: false, error: "newSource gerekli" };
      if (!content.cells?.[cellIndex]) return { success: false, error: `Hucre bulunamadi: ${cellIndex}` };

      content.cells[cellIndex].source = Array.isArray(newSource) ? newSource : [newSource];
      if (newType) content.cells[cellIndex].cell_type = newType;

      fs.writeFileSync(resolved, JSON.stringify(content, null, 1), "utf8");
      return { success: true, message: `Hucre ${cellIndex} guncellendi` };
    }

    if (operation === "add") {
      if (!newSource) return { success: false, error: "newSource gerekli" };
      const cellType = newType || "code";
      const newCell = {
        cell_type: cellType,
        source: Array.isArray(newSource) ? newSource : [newSource],
        metadata: {},
      };
      if (cellType === "code") newCell.outputs = [], newCell.execution_count = null;
      content.cells = content.cells || [];
      content.cells.push(newCell);
      fs.writeFileSync(resolved, JSON.stringify(content, null, 1), "utf8");
      return { success: true, message: `Yeni hucre eklendi (index ${content.cells.length - 1})` };
    }

    if (operation === "delete") {
      if (cellIndex === undefined) return { success: false, error: "cellIndex gerekli" };
      if (!content.cells?.[cellIndex]) return { success: false, error: `Hucre bulunamadi` };
      content.cells.splice(cellIndex, 1);
      fs.writeFileSync(resolved, JSON.stringify(content, null, 1), "utf8");
      return { success: true, message: `Hucre ${cellIndex} silindi` };
    }

    return { success: false, error: `Bilinmeyen operation: ${operation}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "notebook_edit",
  description: "Jupyter notebook (.ipynb) hucrelerini oku, guncelle, ekle, sil. operation: read/update/add/delete.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: ".ipynb dosya yolu" },
      cellIndex: { type: 'integer', description: "Hucre indeksi (0-based)" },
      operation: { type: 'string', description: "read/update/add/delete (default: read)", enum: ["read", "update", "add", "delete"] },
      newSource: { type: 'string', description: "Yeni hucre kaynagi (update/add icin)" },
      newType: { type: 'string', description: "Hucre tipi: code/markdown (update/add icin)", enum: ["code", "markdown"] },
    },
    required: ["filePath", "operation"],
  },
  async execute(params) {
    return await notebookEdit(params);
  },
};