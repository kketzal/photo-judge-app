import * as React from "react"
import Image from "next/legacy/image"
import { cn } from "@/lib/utils"

interface ImageCardProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
  onClick?: () => void
  selected?: boolean
}

export function ImageCard({
  src,
  alt,
  className,
  width = 200,
  height = 200,
  onClick,
  selected = false,
}: ImageCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-gray-200 transition-all hover:shadow-md dark:border-gray-800",
        selected && "ring-2 ring-blue-500",
        className
      )}
      onClick={onClick}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="h-full w-full object-cover"
        layout="responsive"
      />
    </div>
  )
}
