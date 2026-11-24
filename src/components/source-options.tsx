"use client";

import { Database, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import type { SheetsPickerConfig } from "@/domain/import-types";
import { ImportWizard } from "./import-wizard";
import { VendorImportGuide, type ImportVendor } from "./vendor-import-guide";

export function SourceOptions({
  setup = false,
  demo = false,
  activeRevisionId,
  sheetsConfig,
}: {
  setup?: boolean;
  demo?: boolean;
  activeRevisionId?: string;
  sheetsConfig: SheetsPickerConfig | null;
}) {
  const [selection, setSelection] = useState<
    "google" | "market" | "file" | ImportVendor | null
  >(null);
  const market =
    selection === "market" || selection === "Shopee" || selection === "Moka";
  const management = activeRevisionId
    ? { operation: "replace" as const, revision: activeRevisionId }
    : undefined;
  return (
    <>
      <div
        className={setup ? "source-options setup-options" : "source-options"}
      >
        <button
          type="button"
          className="source-choice"
          aria-haspopup="dialog"
          onClick={() =>
            demo
              ? window.location.assign("/masuk?lanjut=%2Fsumber-data")
              : setSelection("google")
          }
        >
          {setup && <FileSpreadsheet size={24} aria-hidden="true" />}
          <strong>Google Sheets</strong>
          <span>Ambil pembaruan dari spreadsheet yang sama.</span>
          <span className="source-action">Hubungkan →</span>
        </button>
        <button
          type="button"
          className="source-choice"
          onClick={() =>
            demo
              ? window.location.assign("/masuk?lanjut=%2Fsumber-data")
              : setSelection("file")
          }
        >
          {setup && <Database size={24} aria-hidden="true" />}
          <strong>Excel / CSV</strong>
          <span>Impor file penjualan yang sudah Anda miliki.</span>
          <span className="source-action">Pilih file →</span>
        </button>
        <button
          type="button"
          className="source-choice"
          aria-expanded={market}
          onClick={() => setSelection(market ? null : "market")}
        >
          <strong>
            {setup ? "Impor dari marketplace / kasir" : "Marketplace / kasir"}
          </strong>
          <span>Impor laporan dari toko online atau aplikasi kasir.</span>
          <span className="source-action">Lihat cara impor →</span>
        </button>
      </div>
      {market && (
        <VendorImportGuide
          open={(vendor) =>
            demo
              ? window.location.assign("/masuk?lanjut=%2Fsumber-data")
              : setSelection(vendor)
          }
        />
      )}
      {selection && selection !== "market" && (
        <ImportWizard
          key={selection}
          vendor={
            selection === "Shopee" || selection === "Moka"
              ? selection
              : undefined
          }
          close={() => setSelection(market ? "market" : null)}
          management={management}
          sheets={selection === "google" ? { config: sheetsConfig } : undefined}
        />
      )}
    </>
  );
}
