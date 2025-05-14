import * as React from "react"
import { X, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PdfViewerModalProps {
  isOpen: boolean
  onClose: () => void
  pdfUrl: string
  title?: string
}

export function PdfViewerModal({
  isOpen,
  onClose,
  pdfUrl,
  title = "Vista Previa del PDF",
}: PdfViewerModalProps) {
  if (!isOpen) return null

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = pdfUrl
    link.download = `ranking-${new Date().toISOString().split("T")[0]}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Descargar
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe
            src={`${pdfUrl}#view=FitH`}
            className="h-full w-full"
            title="PDF Viewer"
          />
        </div>
      </div>
    </div>
  )
}
