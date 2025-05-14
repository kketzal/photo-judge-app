import * as React from "react"
import Image from "next/legacy/image"
import { cn } from "@/lib/utils"

interface RankingListItemProps {
  position: number
  imageUrl: string
  title: string
  score: number
  totalVotes: number
  className?: string
}

export function RankingListItem({
  position,
  imageUrl,
  title,
  score,
  totalVotes,
  className,
}: RankingListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50",
        className
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
        {position}
      </div>
      
      <div className="relative h-16 w-16 overflow-hidden rounded-md">
        <Image
          src={imageUrl}
          alt={title}
          layout="fill"
          objectFit="cover"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="truncate font-medium">{title}</h3>
        <div className="text-sm text-muted-foreground">
          Puntuación: {score.toFixed(1)} ({totalVotes} votos)
        </div>
      </div>
      
      <div className="flex flex-col items-end">
        <div className="text-2xl font-bold text-primary">{score.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">/10</div>
      </div>
    </div>
  )
}
