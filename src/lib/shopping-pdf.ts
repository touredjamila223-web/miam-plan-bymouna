import { jsPDF } from "jspdf";

type Item = {
  item: string;
  qty?: string | null;
  category?: string | null;
  checked?: boolean | null;
};

export function generateShoppingPdf(items: Item[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Liste de courses", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), margin, y);
  y += 8;

  const grouped: Record<string, Item[]> = {};
  for (const it of items) {
    const cat = it.category || "Autres";
    (grouped[cat] = grouped[cat] || []).push(it);
  }

  for (const [cat, arr] of Object.entries(grouped)) {
    ensure(12);
    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(cat, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40);
    for (const it of arr) {
      const label = it.qty ? `${it.item} — ${it.qty}` : it.item;
      const prefix = it.checked ? "[x]" : "[ ]";
      const wrapped = doc.splitTextToSize(`${prefix} ${label}`, maxW);
      ensure(wrapped.length * 5 + 1);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 5 + 1;
    }
    y += 3;
  }

  if (!items.length) {
    doc.setFontSize(12);
    doc.setTextColor(120);
    doc.text("Liste vide", margin, y);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("MiamPlan · Liste de courses", margin, pageH - 8);
    doc.text(`${i} / ${pageCount}`, pageW - margin, pageH - 8, { align: "right" });
  }

  doc.save(`liste_courses_${new Date().toISOString().slice(0, 10)}.pdf`);
}