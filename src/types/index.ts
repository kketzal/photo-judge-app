export interface RankedImage {
  id: string
  url: string
  name: string
  score: number
  votes: number
  ratings: number[]
  createdAt: string
  updatedAt: string
  totalScore?: number
  observations?: string
  originalPath?: string
  error?: string | Error
  file?: File
  pdfFile?: File
}

export interface ImageScore {
  imageId: string
  score: number
  voterId?: string
}

export interface ActionSerializableRankedImage extends Omit<RankedImage, 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
}

export interface RankingStats {
  totalImages: number
  totalVotes: number
  averageScore: number
  lastUpdated: string
}

export interface UserVote {
  imageId: string
  score: number
  timestamp: string
}
