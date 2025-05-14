import * as React from "react"
import Image from "next/legacy/image"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImageRatingModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  onRate: (score: number) => void
  currentScore?: number
}

export function ImageRatingModal({
  isOpen,
  onClose,
  imageUrl,
  onRate,
  currentScore = 0,
}: ImageRatingModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-4xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 top-4"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Cerrar</span>
        </Button>

        <div className="flex flex-col items-center gap-6 md:flex-row">
          <div className="relative h-64 w-full md:h-96 md:w-1/2">
            <Image
              src={imageUrl}
              alt="Imagen a calificar"
              layout="fill"
              objectFit="contain"
              className="rounded-lg"
            />
          </div>

          <div className="w-full space-y-6 md:w-1/2">
            <h2 className="text-2xl font-bold">Calificar Imagen</h2>
            
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Puntuación: {currentScore}/10</h3>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                  <Button
                    key={score}
                    variant={currentScore >= score ? "default" : "outline"}
                    onClick={() => onRate(score)}
                    className="h-10 w-10 p-0"
                  >
                    {score}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={onClose}>Guardar</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
