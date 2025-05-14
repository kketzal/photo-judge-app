export interface ActionSerializableRankedImage {
  id: string;
  name: string;
  imageName?: string;
  score: number;
  observations?: string;
  // Add any other properties that your ranked images should have
}

export interface RankedImageScores {
  artisticQuality: number;
  contextualization: number;
  originality: number;
  technicalQuality: number;
  totalScore: number;
}
